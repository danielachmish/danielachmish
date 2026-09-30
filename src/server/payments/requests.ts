import { withContext, type DbContext, actorOf } from "../db/context";
import type { Tx } from "../db/client";
import { DomainError, isUniqueViolation, notFound } from "../errors";
import { loadCard, pledgeFigures } from "../ledger/balance";
import { assertAgorot } from "../money";
import { paymentProvider, toIntegrationRef } from "../providers/registry";
import { canCreatePaymentRequests, subscriptionOf } from "../billing/policy";
import { audit } from "../audit";
import { tenantSettings } from "../settings";

const REQUEST_TTL_MIN = 60;

export async function activePaymentIntegration(tx: Tx) {
  return tx.integrationAccount.findFirst({ where: { kind: "payment", status: "active" }, orderBy: { createdAt: "desc" } });
}

export type NewPaymentRequest = {
  congregantId: string;
  amountAgorot?: number; // default: full outstanding of the chosen pledges (or of the card)
  pledgeIds?: string[];
  idempotencyKey: string;
  via: "portal" | "gabbai" | "whatsapp";
};

/**
 * Creates (or returns the existing) payment request and a hosted payment page.
 * Double-clicks / retries with the same idempotency key return the same request and page.
 */
export async function createPaymentRequest(ctx: DbContext & { tenantId: string }, input: NewPaymentRequest) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(input.idempotencyKey)) throw new DomainError("bad_request", "בקשה לא תקינה.");
  const tenantId = ctx.tenantId;

  const prepared = await withContext(ctx, async (tx) => {
    const existing = await tx.paymentRequest.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: input.idempotencyKey } },
      include: { attempts: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (existing) return { request: existing, attempt: existing.attempts[0] ?? null };

    const sub = await subscriptionOf(tx, tenantId);
    if (!canCreatePaymentRequests(sub?.status))
      throw new DomainError("subscription_inactive", "התשלום המקוון אינו זמין כרגע בבית הכנסת. אפשר לפנות לגבאי.", 409);
    const integration = await activePaymentIntegration(tx);
    if (!integration) throw new DomainError("no_payment_integration", "בית הכנסת עדיין לא חיבר סליקה. אפשר לפנות לגבאי.", 409);

    // Options the gabbai controls (apply to the congregant's own choices only).
    if (input.via !== "gabbai") {
      const s = await tenantSettings(tx, tenantId);
      if (input.pledgeIds?.length && !s.portalSelectPledges)
        throw new DomainError("select_disabled", "בית הכנסת אינו מאפשר בחירת נדרים לתשלום. אפשר לשלם את כל היתרה.", 409);
      if (input.amountAgorot !== undefined && !s.portalPartialPayment)
        throw new DomainError("partial_disabled", "בית הכנסת אינו מאפשר תשלום חלקי. אפשר לשלם את כל היתרה.", 409);
      if (input.amountAgorot !== undefined && s.portalMinPartialAgorot > 0 && input.amountAgorot < s.portalMinPartialAgorot)
        throw new DomainError("below_minimum", `הסכום המינימלי לתשלום חלקי הוא ${s.portalMinPartialAgorot / 100} ₪.`, 409);
    }
    // Re-check the balance right before creating the request.
    const congregant = await tx.congregant.findUnique({ where: { id: input.congregantId } });
    if (!congregant) throw notFound("כרטיס המתפלל");
    const card = await loadCard(tx, input.congregantId);
    const chosen = input.pledgeIds?.length ? card.pledges.filter((p) => input.pledgeIds!.includes(p.id)) : card.pledges;
    if (input.pledgeIds?.length && chosen.length !== input.pledgeIds.length) throw notFound("הנדר");
    const outstanding = chosen.reduce((s, p) => s + Math.max(0, pledgeFigures(p).outstanding), 0);
    if (outstanding <= 0) throw new DomainError("nothing_to_pay", "אין יתרה פתוחה לתשלום.", 409);
    const amount = input.amountAgorot ?? outstanding;
    assertAgorot(amount);
    if (amount > card.summary.debtAgorot)
      throw new DomainError("amount_exceeds_debt", "הסכום גבוה מהיתרה הפתוחה. אפשר לבחור סכום נמוך יותר.", 409);

    try {
      const request = await tx.paymentRequest.create({
        data: {
          tenantId,
          congregantId: input.congregantId,
          integrationAccountId: integration.id,
          amountAgorot: amount,
          pledgeIds: input.pledgeIds ?? [],
          expiresAt: new Date(Date.now() + REQUEST_TTL_MIN * 60_000),
          idempotencyKey: input.idempotencyKey,
          createdVia: input.via,
        },
      });
      await audit(tx, tenantId, actorOf(ctx), "payment_request.create", { type: "PaymentRequest", id: request.id }, { amountAgorot: amount });
      return { request: { ...request, attempts: [] }, attempt: null, integration, payerName: `${congregant.firstName} ${congregant.lastName}`, phone: congregant.phone };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      throw new DomainError("retry", "הבקשה כבר בטיפול. נסו לרענן את העמוד.", 409);
    }
  });

  if (prepared.attempt) return { requestId: prepared.request.id, paymentUrl: prepared.attempt.paymentUrl, reused: true };
  if (prepared.request.status !== "open") throw new DomainError("request_closed", "בקשת התשלום כבר הסתיימה.", 409);

  // Provider call happens outside the DB transaction.
  const integration =
    "integration" in prepared && prepared.integration
      ? prepared.integration
      : await withContext(ctx, (tx) => tx.integrationAccount.findUniqueOrThrow({ where: { id: prepared.request.integrationAccountId } }));
  const ref = toIntegrationRef(integration);
  const base = process.env.APP_BASE_URL;
  const page = await paymentProvider(integration.provider).createPaymentPage(ref, {
    requestId: prepared.request.id,
    amountAgorot: prepared.request.amountAgorot,
    currency: "ILS",
    description: "תשלום נדרים",
    payer: { name: "payerName" in prepared ? (prepared.payerName ?? "") : "", phone: "phone" in prepared ? prepared.phone : null },
    callbackUrl: `${base}/api/providers/payment/${integration.provider}/callback`,
    successUrl: `${base}/pay/return?r=${prepared.request.id}`,
    failureUrl: `${base}/pay/return?r=${prepared.request.id}`,
    expiresAt: prepared.request.expiresAt,
  });
  await withContext(ctx, (tx) =>
    tx.paymentAttempt.create({
      data: { tenantId, paymentRequestId: prepared.request.id, providerPageRef: page.pageRef, paymentUrl: page.paymentUrl },
    }),
  );
  return { requestId: prepared.request.id, paymentUrl: page.paymentUrl, reused: false };
}

/** Status as shown on the return page. The browser return itself never marks anything as paid. */
export async function paymentRequestStatus(ctx: DbContext, requestId: string) {
  return withContext(ctx, async (tx) => {
    const r = await tx.paymentRequest.findUnique({ where: { id: requestId } });
    if (!r) throw notFound("בקשת התשלום");
    return { status: r.status, amountAgorot: r.amountAgorot };
  });
}
