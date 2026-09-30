import { withContext, type Actor } from "../db/context";
import { planConfig } from "../config";
import { saasBillingProvider } from "../providers/registry";
import { DomainError, isUniqueViolation } from "../errors";
import { audit } from "../audit";
import type { SubStatus } from "./policy";

// SaaS subscription money is a separate domain: its own tables, its own provider account (platform owner),
// and it never touches congregant ledgers.

const DAY = 86400_000;
const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
};

const TRANSITIONS: Record<SubStatus, SubStatus[]> = {
  trial: ["active", "past_due", "cancelled"],
  active: ["past_due", "cancelled"],
  past_due: ["active", "grace", "suspended", "cancelled"],
  grace: ["active", "suspended", "cancelled"],
  suspended: ["active", "cancelled"],
  cancelled: [],
};

export async function setSubscriptionStatus(actor: Actor, tenantId: string, to: SubStatus, now = new Date()) {
  return withContext({ kind: "platform_admin", userId: actor.id }, async (tx) => {
    const sub = await tx.saaSSubscription.findUniqueOrThrow({ where: { tenantId } });
    if (!TRANSITIONS[sub.status as SubStatus]?.includes(to))
      throw new DomainError("invalid_transition", `לא ניתן לעבור ממצב ${sub.status} למצב ${to}.`, 409);
    const cfg = planConfig();
    await tx.saaSSubscription.update({
      where: { tenantId },
      data: {
        status: to,
        cancelledAt: to === "cancelled" ? now : undefined,
        accessEndsAt: to === "cancelled" ? new Date(now.getTime() + cfg.exportAccessDays * DAY) : undefined,
        graceEndsAt: to === "grace" ? new Date(now.getTime() + cfg.graceDays * DAY) : undefined,
      },
    });
    await audit(tx, tenantId, actor, "subscription.status", { type: "SaaSSubscription", id: sub.id }, { from: sub.status, to });
  });
}

/**
 * Daily lifecycle (worker). Trial end / period end → invoice → charge through SaaSBillingProvider.
 * Without a configured provider the invoice stays open (past_due) until an admin records a manual payment.
 */
export async function runSubscriptionCycle(tenantId: string, now = new Date()) {
  const cfg = planConfig();
  const sub = await withContext({ kind: "system", tenantId }, (tx) => tx.saaSSubscription.findUnique({ where: { tenantId } }));
  if (!sub || sub.status === "cancelled") return { action: "none" };

  if ((sub.status === "past_due" || sub.status === "grace") && sub.graceEndsAt && sub.graceEndsAt < now) {
    await withContext({ kind: "system", tenantId }, (tx) => tx.saaSSubscription.update({ where: { tenantId }, data: { status: "suspended" } }));
    return { action: "suspended" };
  }
  const periodEnd = sub.status === "trial" ? sub.trialEndsAt : sub.currentPeriodEnd;
  if (!periodEnd || periodEnd > now || sub.status === "suspended") return { action: "none" };
  if (sub.status === "past_due" || sub.status === "grace") return { action: "awaiting_payment" };

  const periodStart = periodEnd;
  const invoice = await withContext({ kind: "system", tenantId }, async (tx) => {
    try {
      return await tx.saaSInvoice.create({
        data: { tenantId, subscriptionId: sub.id, periodStart, periodEnd: addMonths(periodStart, 1), amountAgorot: cfg.priceAgorot },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      return tx.saaSInvoice.findUniqueOrThrow({ where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart } } });
    }
  });
  if (invoice.status === "paid") return { action: "none" };
  if (invoice.amountAgorot === 0) return markInvoicePaid(tenantId, invoice.id, { provider: "manual", chargeId: `zero-${invoice.id}`, recordedBy: "system", note: "מחיר מסלול 0 בתצורה" });

  const provider = saasBillingProvider();
  if (!provider) {
    await withContext({ kind: "system", tenantId }, (tx) =>
      tx.saaSSubscription.update({ where: { tenantId }, data: { status: "past_due", graceEndsAt: new Date(now.getTime() + cfg.graceDays * DAY) } }),
    );
    return { action: "invoice_open_manual" };
  }
  const r = await provider.chargeInvoice({ tenantId, invoiceId: invoice.id, amountAgorot: invoice.amountAgorot });
  if (r.status === "succeeded") return markInvoicePaid(tenantId, invoice.id, { provider: provider.name, chargeId: r.chargeId, recordedBy: "system" });
  await withContext({ kind: "system", tenantId }, async (tx) => {
    await tx.saaSCharge.create({
      data: { tenantId, invoiceId: invoice.id, provider: provider.name, providerChargeId: `${r.chargeId}:${Date.now()}`, amountAgorot: invoice.amountAgorot, status: "failed", note: r.error },
    });
    await tx.saaSSubscription.update({ where: { tenantId }, data: { status: "grace", graceEndsAt: new Date(now.getTime() + cfg.graceDays * DAY) } });
    await tx.supportCase.create({ data: { tenantId, kind: "other", summary: "חיוב מנוי נכשל – המנוי בתקופת חסד." } });
  });
  return { action: "charge_failed" };
}

export async function markInvoicePaid(
  tenantId: string,
  invoiceId: string,
  opts: { provider: string; chargeId: string; recordedBy: string; note?: string },
) {
  return withContext({ kind: "system", tenantId }, async (tx) => {
    const inv = await tx.saaSInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (inv.status === "paid") return { action: "already_paid" };
    try {
      await tx.saaSCharge.create({
        data: { tenantId, invoiceId, provider: opts.provider, providerChargeId: opts.chargeId, amountAgorot: inv.amountAgorot, status: "succeeded", recordedBy: opts.recordedBy, note: opts.note },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
    await tx.saaSInvoice.update({ where: { id: invoiceId }, data: { status: "paid", paidAt: new Date() } });
    await tx.saaSSubscription.update({
      where: { tenantId },
      data: { status: "active", currentPeriodStart: inv.periodStart, currentPeriodEnd: inv.periodEnd, graceEndsAt: null, messagesUsed: 0 },
    });
    await tx.auditLog.createMany({ data: { tenantId, actorType: "system", actorId: opts.recordedBy, action: "subscription.invoice_paid", entityType: "SaaSInvoice", entityId: invoiceId } });
    return { action: "paid" };
  });
}

/** Documented manual payment (e.g. bank transfer to the platform owner) recorded by the platform admin. */
export async function recordManualSubscriptionPayment(adminId: string, tenantId: string, invoiceId: string, reference: string) {
  if (!reference.trim()) throw new DomainError("reference_required", "יש לציין אסמכתה לתשלום.");
  return markInvoicePaid(tenantId, invoiceId, { provider: "manual", chargeId: reference.trim(), recordedBy: adminId, note: "תשלום ידני מתועד" });
}
