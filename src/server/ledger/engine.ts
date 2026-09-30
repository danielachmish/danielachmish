import type { Tx } from "../db/client";
import type { Actor } from "../db/context";
import { DomainError, isUniqueViolation, notFound } from "../errors";
import { assertAgorot } from "../money";
import { audit } from "../audit";
import { loadCard, paymentFigures, pledgeFigures } from "./balance";

// All ledger mutations for a card run while holding a row lock on that card (SELECT ... FOR UPDATE).
// This serialises concurrent payments / refunds / corrections of the same card, so a pledge can never
// be paid twice and refunds can never exceed what was received.

export async function lockCard(tx: Tx, tenantId: string, congregantId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Congregant" WHERE id = ${congregantId}::uuid AND "tenantId" = ${tenantId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound("כרטיס המתפלל");
}

type AllocateOpts = { preferPledgeIds?: string[]; createdBy: string };

/**
 * Applies unallocated money of confirmed payments on this card to outstanding pledges.
 * Order: the pledges the payer chose (in their order), then oldest first. Remaining money stays as credit.
 * Caller must hold the card lock.
 */
export async function applyAvailableCredit(tx: Tx, tenantId: string, congregantId: string, opts: AllocateOpts & { onlyPaymentId?: string }) {
  const { pledges, payments } = await loadCard(tx, congregantId);
  const prefer = opts.preferPledgeIds ?? [];
  const ordered = [
    ...prefer.map((id) => pledges.find((p) => p.id === id)).filter((p): p is (typeof pledges)[number] => !!p),
    ...pledges.filter((p) => !prefer.includes(p.id)),
  ];
  const outstanding = new Map(ordered.map((p) => [p.id, pledgeFigures(p).outstanding]));
  // The payment being recorded is used first, then older credit.
  const sources = payments
    .filter((p) => p.status === "confirmed")
    .sort((a, b) => (a.id === opts.onlyPaymentId ? -1 : b.id === opts.onlyPaymentId ? 1 : a.receivedAt.getTime() - b.receivedAt.getTime()));

  const created: { paymentId: string; pledgeId: string; amountAgorot: number }[] = [];
  for (const pay of sources) {
    let credit = paymentFigures(pay).credit;
    for (const pledge of ordered) {
      if (credit <= 0) break;
      const open = outstanding.get(pledge.id) ?? 0;
      if (open <= 0) continue;
      const amount = Math.min(open, credit);
      await tx.allocation.create({
        data: {
          tenantId,
          congregantId,
          paymentId: pay.id,
          pledgeId: pledge.id,
          amountAgorot: amount,
          reason: pay.id === opts.onlyPaymentId ? "payment" : "credit_apply",
          createdBy: opts.createdBy,
        },
      });
      created.push({ paymentId: pay.id, pledgeId: pledge.id, amountAgorot: amount });
      outstanding.set(pledge.id, open - amount);
      credit -= amount;
    }
  }
  return created;
}

// ───────────── pledges ─────────────

export type NewPledge = {
  congregantId: string;
  amountAgorot: number;
  pledgeDate: Date;
  kind?: "pledge" | "opening_balance";
  dueDate?: Date | null;
  category?: string | null;
  description?: string | null;
  internalNote?: string | null;
  clientOpId?: string | null;
};

export async function createPledge(tx: Tx, tenantId: string, actor: Actor, input: NewPledge) {
  assertAgorot(input.amountAgorot);
  if (input.clientOpId) {
    const existing = await tx.pledge.findUnique({ where: { tenantId_clientOpId: { tenantId, clientOpId: input.clientOpId } } });
    if (existing) return { pledge: existing, duplicate: true };
  }
  await lockCard(tx, tenantId, input.congregantId);
  const pledge = await tx.pledge.create({
    data: {
      tenantId,
      congregantId: input.congregantId,
      kind: input.kind ?? "pledge",
      amountAgorot: input.amountAgorot,
      pledgeDate: input.pledgeDate,
      dueDate: input.dueDate ?? null,
      category: input.category ?? null,
      description: input.description ?? null,
      internalNote: input.internalNote ?? null,
      clientOpId: input.clientOpId ?? null,
      createdBy: actor.id,
    },
  });
  await applyAvailableCredit(tx, tenantId, input.congregantId, { createdBy: actor.id });
  await audit(tx, tenantId, actor, "pledge.create", { type: "Pledge", id: pledge.id }, { amountAgorot: input.amountAgorot });
  return { pledge, duplicate: false };
}

/**
 * Corrects a pledge amount by a signed delta with a mandatory reason. Setting the effective amount to 0 cancels it.
 * If the pledge is already paid beyond the new amount, the caller must decide explicitly:
 *   onExcess = "release_to_credit" moves the excess allocations back to the payment(s) as credit
 *   (which is then applied to other open pledges of the card), otherwise the operation stops for review.
 */
export async function adjustPledge(
  tx: Tx,
  tenantId: string,
  actor: Actor,
  input: { pledgeId: string; deltaAgorot: number; reason: string; onExcess?: "release_to_credit" | "reject" },
) {
  assertAgorot(input.deltaAgorot, { allowNegative: true });
  if (!input.reason?.trim()) throw new DomainError("reason_required", "יש לציין סיבה לתיקון.");
  const found = await tx.pledge.findUnique({ where: { id: input.pledgeId } });
  if (!found) throw notFound("הנדר");
  await lockCard(tx, tenantId, found.congregantId);
  const pledge = await tx.pledge.findUniqueOrThrow({
    where: { id: input.pledgeId },
    include: { adjustments: true, allocations: { orderBy: { createdAt: "desc" } } },
  });
  const f = pledgeFigures(pledge);
  const newEffective = f.effective + input.deltaAgorot;
  if (newEffective < 0) throw new DomainError("negative_pledge", "לא ניתן להפחית נדר מתחת לאפס.");
  const excess = f.allocated - newEffective;
  if (excess > 0 && input.onExcess !== "release_to_credit") {
    throw new DomainError(
      "pledge_already_paid",
      `על הנדר כבר שולמו ${f.allocated / 100} ₪. כדי להפחית אותו יש לבחור להעביר את העודף לזכות המתפלל.`,
      409,
    );
  }
  const adj = await tx.adjustment.create({
    data: { tenantId, pledgeId: pledge.id, deltaAgorot: input.deltaAgorot, reason: input.reason.trim(), createdBy: actor.id },
  });
  if (excess > 0) await reverseAllocations(tx, tenantId, pledge.congregantId, { pledgeId: pledge.id }, excess, "pledge_reduction", adj.id, actor.id);
  await applyAvailableCredit(tx, tenantId, pledge.congregantId, { createdBy: actor.id });
  await audit(tx, tenantId, actor, "pledge.adjust", { type: "Pledge", id: pledge.id }, {
    deltaAgorot: input.deltaAgorot,
    reason: input.reason,
    releasedAgorot: Math.max(0, excess),
  });
  return adj;
}

/** Writes negative allocation rows, newest net allocation first, until `amount` is reversed. */
async function reverseAllocations(
  tx: Tx,
  tenantId: string,
  congregantId: string,
  where: { pledgeId?: string; paymentId?: string },
  amount: number,
  reason: "refund" | "pledge_reduction",
  sourceId: string,
  createdBy: string,
) {
  const rows = await tx.allocation.findMany({ where: { congregantId, ...where }, orderBy: { createdAt: "asc" } });
  // Net per (payment, pledge), keeping the time of the latest positive allocation for ordering.
  const net = new Map<string, { paymentId: string; pledgeId: string; amount: number; at: number }>();
  for (const r of rows) {
    const k = `${r.paymentId}:${r.pledgeId}`;
    const cur = net.get(k) ?? { paymentId: r.paymentId, pledgeId: r.pledgeId, amount: 0, at: 0 };
    cur.amount += r.amountAgorot;
    if (r.amountAgorot > 0) cur.at = Math.max(cur.at, r.createdAt.getTime());
    net.set(k, cur);
  }
  let left = amount;
  for (const a of [...net.values()].filter((x) => x.amount > 0).sort((x, y) => y.at - x.at)) {
    if (left <= 0) break;
    const take = Math.min(a.amount, left);
    await tx.allocation.create({
      data: { tenantId, congregantId, paymentId: a.paymentId, pledgeId: a.pledgeId, amountAgorot: -take, reason, sourceId, createdBy },
    });
    left -= take;
  }
  if (left > 0) throw new Error("ledger invariant violated: not enough allocations to reverse");
}

// ───────────── payments ─────────────

export type ProviderIdentity = { provider: string; environment: string; accountId: string; transactionId: string };

export type ConfirmedCardPayment = {
  congregantId: string;
  amountAgorot: number;
  currency: string;
  identity: ProviderIdentity;
  integrationAccountId: string;
  paymentRequestId?: string | null;
  preferPledgeIds?: string[];
  receivedAt?: Date;
};

/**
 * Records a verified provider charge exactly once (unique provider identity), allocates it and
 * enqueues the confirmation in the same transaction. Returns { duplicate: true } for a replay.
 */
export async function recordVerifiedCardPayment(tx: Tx, tenantId: string, actor: Actor, input: ConfirmedCardPayment) {
  assertAgorot(input.amountAgorot);
  if (input.currency !== "ILS") throw new DomainError("currency_mismatch", "מטבע לא נתמך.");
  await lockCard(tx, tenantId, input.congregantId);
  const idWhere = {
    provider_providerEnvironment_providerAccountId_providerTransactionId: {
      provider: input.identity.provider,
      providerEnvironment: input.identity.environment,
      providerAccountId: input.identity.accountId,
      providerTransactionId: input.identity.transactionId,
    },
  };
  const existing = await tx.payment.findUnique({ where: idWhere });
  if (existing) return { payment: existing, duplicate: true, allocations: [] };

  const payment = await tx.payment.create({
    data: {
      tenantId,
      congregantId: input.congregantId,
      method: "card",
      status: "confirmed",
      amountAgorot: input.amountAgorot,
      currency: "ILS",
      provider: input.identity.provider,
      providerEnvironment: input.identity.environment,
      providerAccountId: input.identity.accountId,
      providerTransactionId: input.identity.transactionId,
      integrationAccountId: input.integrationAccountId,
      paymentRequestId: input.paymentRequestId ?? null,
      reportedBy: "provider",
      receivedAt: input.receivedAt ?? new Date(),
      approvedAt: new Date(),
    },
  });
  const allocations = await applyAvailableCredit(tx, tenantId, input.congregantId, {
    preferPledgeIds: input.preferPledgeIds,
    onlyPaymentId: payment.id,
    createdBy: actor.id,
  });
  if (input.paymentRequestId) {
    await tx.paymentRequest.updateMany({
      where: { id: input.paymentRequestId, status: { in: ["open", "expired"] } },
      data: { status: "paid", paidAt: new Date() },
    });
  }
  await tx.outbox.create({
    data: { tenantId, topic: "payment_confirmation", payload: { paymentId: payment.id, congregantId: input.congregantId } },
  });
  await tx.outbox.create({ data: { tenantId, topic: "receipt", payload: { paymentId: payment.id } } });
  await audit(tx, tenantId, actor, "payment.card_confirmed", { type: "Payment", id: payment.id }, { amountAgorot: input.amountAgorot });
  return { payment, duplicate: false, allocations };
}

/** Cash / transfer / check reported by the gabbai or the congregant. Does not reduce debt until approved. */
export async function reportExternalPayment(
  tx: Tx,
  tenantId: string,
  actor: Actor,
  input: {
    congregantId: string;
    amountAgorot: number;
    method: "cash" | "transfer" | "check";
    reference?: string | null;
    note?: string | null;
    clientOpId?: string | null;
    preferPledgeIds?: string[];
    approveNow?: boolean; // gabbai recording money he already received
  },
) {
  assertAgorot(input.amountAgorot);
  if (input.clientOpId) {
    const existing = await tx.payment.findUnique({ where: { tenantId_clientOpId: { tenantId, clientOpId: input.clientOpId } } });
    if (existing) return { payment: existing, duplicate: true };
  }
  await lockCard(tx, tenantId, input.congregantId);
  const approve = !!input.approveNow && actor.type === "gabbai";
  const payment = await tx.payment.create({
    data: {
      tenantId,
      congregantId: input.congregantId,
      method: input.method,
      status: approve ? "confirmed" : "pending_approval",
      amountAgorot: input.amountAgorot,
      reportedBy: actor.type === "gabbai" ? "gabbai" : "congregant",
      reference: input.reference ?? null,
      note: input.note ?? null,
      clientOpId: input.clientOpId ?? null,
      approvedBy: approve ? actor.id : null,
      approvedAt: approve ? new Date() : null,
    },
  });
  if (approve) {
    await applyAvailableCredit(tx, tenantId, input.congregantId, {
      preferPledgeIds: input.preferPledgeIds,
      onlyPaymentId: payment.id,
      createdBy: actor.id,
    });
  } else {
    await tx.task.create({
      data: {
        tenantId,
        kind: "external_payment",
        congregantId: input.congregantId,
        paymentId: payment.id,
        summary: "דיווח על תשלום שממתין לאישור",
        pausesReminders: true,
        details: { method: input.method, amountAgorot: input.amountAgorot, preferPledgeIds: input.preferPledgeIds ?? [] },
      },
    });
  }
  await audit(tx, tenantId, actor, approve ? "payment.external_recorded" : "payment.external_reported", { type: "Payment", id: payment.id }, {
    method: input.method,
    amountAgorot: input.amountAgorot,
  });
  return { payment, duplicate: false };
}

export async function decideExternalPayment(
  tx: Tx,
  tenantId: string,
  actor: Actor,
  input: { paymentId: string; approve: boolean; reason?: string },
) {
  if (actor.type !== "gabbai") throw new DomainError("forbidden", "רק הגבאי יכול לאשר תשלום.", 403);
  const p = await tx.payment.findUnique({ where: { id: input.paymentId } });
  if (!p) throw notFound("התשלום");
  await lockCard(tx, tenantId, p.congregantId);
  const fresh = await tx.payment.findUniqueOrThrow({ where: { id: p.id } });
  if (fresh.status !== "pending_approval") throw new DomainError("already_decided", "התשלום כבר טופל.", 409);
  const task = await tx.task.findFirst({ where: { paymentId: p.id, status: "open" } });
  const prefer = ((task?.details as { preferPledgeIds?: string[] } | null)?.preferPledgeIds ?? []) as string[];
  if (input.approve) {
    await tx.payment.update({ where: { id: p.id }, data: { status: "confirmed", approvedBy: actor.id, approvedAt: new Date() } });
    await applyAvailableCredit(tx, tenantId, p.congregantId, { preferPledgeIds: prefer, onlyPaymentId: p.id, createdBy: actor.id });
  } else {
    await tx.payment.update({ where: { id: p.id }, data: { status: "rejected", rejectedReason: input.reason ?? null } });
  }
  await tx.task.updateMany({
    where: { paymentId: p.id, status: "open" },
    data: { status: "resolved", resolvedAt: new Date(), resolvedBy: actor.id, resolution: input.approve ? "approved" : "rejected" },
  });
  await audit(tx, tenantId, actor, input.approve ? "payment.approved" : "payment.rejected", { type: "Payment", id: p.id }, {
    reason: input.reason ?? null,
  });
}

// ───────────── refunds ─────────────

export type VerifiedRefund = {
  paymentId: string;
  amountAgorot: number;
  identity?: { provider: string; environment: string; accountId: string; refundId: string };
};

/**
 * Applies a verified refund once. Reduces unallocated credit of that payment first, then reverses its
 * allocations newest first (re-opening only the debt that this payment had paid).
 */
export async function applyVerifiedRefund(tx: Tx, tenantId: string, actor: Actor, input: VerifiedRefund) {
  assertAgorot(input.amountAgorot);
  const p = await tx.payment.findUnique({ where: { id: input.paymentId } });
  if (!p) throw notFound("התשלום");
  await lockCard(tx, tenantId, p.congregantId);
  if (input.identity) {
    const existing = await tx.refund.findUnique({
      where: {
        provider_providerEnvironment_providerAccountId_providerRefundId: {
          provider: input.identity.provider,
          providerEnvironment: input.identity.environment,
          providerAccountId: input.identity.accountId,
          providerRefundId: input.identity.refundId,
        },
      },
    });
    if (existing) return { refund: existing, duplicate: true };
  }
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: p.id }, include: { refunds: true, allocations: true } });
  if (payment.status !== "confirmed") throw new DomainError("refund_unconfirmed_payment", "לא ניתן להחזיר תשלום שלא אושר.", 409);
  const f = paymentFigures(payment);
  if (f.refunded + input.amountAgorot > payment.amountAgorot)
    throw new DomainError("refund_exceeds_payment", "סכום ההחזר עולה על הסכום שהתקבל בעסקה.", 409);

  const refund = await tx.refund.create({
    data: {
      tenantId,
      paymentId: payment.id,
      amountAgorot: input.amountAgorot,
      provider: input.identity?.provider ?? null,
      providerEnvironment: input.identity?.environment ?? null,
      providerAccountId: input.identity?.accountId ?? null,
      providerRefundId: input.identity?.refundId ?? null,
      createdBy: actor.id,
    },
  });
  const creditAfter = f.net - input.amountAgorot - f.allocated;
  if (creditAfter < 0) {
    await reverseAllocations(tx, tenantId, payment.congregantId, { paymentId: payment.id }, -creditAfter, "refund", refund.id, actor.id);
    // Money freed elsewhere (other payments' credit) may now cover the re-opened pledge.
    await applyAvailableCredit(tx, tenantId, payment.congregantId, { createdBy: actor.id });
  }
  await audit(tx, tenantId, actor, "payment.refund", { type: "Refund", id: refund.id }, { amountAgorot: input.amountAgorot, paymentId: payment.id });
  return { refund, duplicate: false };
}
