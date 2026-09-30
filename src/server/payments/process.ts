import { systemCtx, withContext, type Actor } from "../db/context";
import type { Tx } from "../db/client";
import { paymentProvider, toIntegrationRef } from "../providers/registry";
import type { VerifiedTransaction } from "../providers/types";
import { applyVerifiedRefund, recordVerifiedCardPayment } from "../ledger/engine";
import { DomainError } from "../errors";

const PROVIDER_ACTOR: Actor = { type: "provider", id: "payment-callback" };
const MAX_ATTEMPTS = 8;

type Outcome = { status: "processed" | "exception" | "ignored" | "retry"; note: string };

async function openException(tx: Tx, tenantId: string, eventId: string | null, summary: string, details: object, congregantId?: string | null) {
  await tx.task.create({
    data: { tenantId, kind: "provider_exception", providerEventId: eventId, congregantId: congregantId ?? null, summary, details, pausesReminders: !!congregantId },
  });
}

/**
 * Processes one stored payment callback. Idempotent: safe to run any number of times, concurrently, or
 * after a crash. Ledger changes only happen after a server-side status query confirms the transaction
 * and account, request, amount, currency and operation type all match.
 */
export async function processPaymentEvent(tenantId: string, eventId: string): Promise<Outcome> {
  const ctx = systemCtx(tenantId);
  const ev = await withContext(ctx, (tx) => tx.providerEvent.findUnique({ where: { id: eventId } }));
  if (!ev || ev.status === "processed" || ev.status === "ignored" || ev.status === "exception") return { status: "ignored", note: "already handled" };

  const finish = (o: Outcome, extra?: (tx: Tx) => Promise<void>) =>
    withContext(ctx, async (tx) => {
      if (extra) await extra(tx);
      await tx.providerEvent.update({
        where: { id: eventId },
        data: {
          status: o.status === "retry" ? "received" : o.status,
          attempts: { increment: 1 },
          resultNote: o.note,
          processedAt: o.status === "retry" ? null : new Date(),
        },
      });
      return o;
    });

  if (!ev.authenticated) {
    return finish({ status: "exception", note: "callback failed authentication" }, (tx) =>
      openException(tx, tenantId, eventId, "התקבלה הודעת סליקה שלא אומתה. החוב לא עודכן.", { reason: "unauthenticated" }),
    );
  }

  const integration = await withContext(ctx, (tx) => tx.integrationAccount.findUniqueOrThrow({ where: { id: ev.integrationAccountId } }));
  const provider = paymentProvider(integration.provider);
  const ref = toIntegrationRef(integration);
  const routing = provider.routeCallback(JSON.stringify(ev.payload));

  let txns: VerifiedTransaction[];
  try {
    txns = await provider.fetchTransaction(ref, { pageRef: routing?.pageRef, transactionId: routing?.transactionId });
  } catch (e) {
    // Provider unavailable: keep the event, retry later. Never guess.
    return finish({ status: ev.attempts + 1 >= MAX_ATTEMPTS ? "exception" : "retry", note: `status query failed: ${(e as Error).message}` });
  }

  const relevant = txns.filter((t) => t.accountId === integration.externalAccountId);
  if (relevant.length === 0) {
    if (ev.attempts + 1 < MAX_ATTEMPTS) return finish({ status: "retry", note: "transaction not yet visible at provider" });
    return finish({ status: "exception", note: "transaction not found at provider" }, (tx) =>
      openException(tx, tenantId, eventId, "הודעת סליקה ללא עסקה תואמת אצל ספק הסליקה.", { routing }),
    );
  }

  const notes: string[] = [];
  let retry = false;
  for (const t of relevant) {
    const r = await applyTransaction(tenantId, eventId, integration, t);
    notes.push(r.note);
    if (r.status === "retry") retry = true;
  }
  if (retry && ev.attempts + 1 < MAX_ATTEMPTS) return finish({ status: "retry", note: notes.join("; ") });
  return finish({ status: "processed", note: notes.join("; ") });
}

async function applyTransaction(
  tenantId: string,
  eventId: string | null,
  integration: { id: string; provider: string; environment: string; externalAccountId: string },
  t: VerifiedTransaction,
): Promise<Outcome> {
  const ctx = systemCtx(tenantId);
  const identity = { provider: integration.provider, environment: integration.environment, accountId: integration.externalAccountId };

  if (t.operation === "refund") {
    return withContext(ctx, async (tx) => {
      const original = t.originalTransactionId
        ? await tx.payment.findUnique({
            where: {
              provider_providerEnvironment_providerAccountId_providerTransactionId: {
                provider: identity.provider,
                providerEnvironment: identity.environment,
                providerAccountId: identity.accountId,
                providerTransactionId: t.originalTransactionId,
              },
            },
          })
        : null;
      // Refund before the charge was recorded: keep for retry; the charge will be recorded first.
      if (!original) return { status: "retry" as const, note: "refund for a charge not yet recorded" };
      if (t.status !== "refunded" || t.currency !== "ILS") return { status: "ignored" as const, note: `refund status ${t.status}` };
      try {
        const r = await applyVerifiedRefund(tx, tenantId, PROVIDER_ACTOR, {
          paymentId: original.id,
          amountAgorot: t.amountAgorot,
          identity: { ...identity, refundId: t.transactionId },
        });
        return { status: "processed" as const, note: r.duplicate ? "refund already applied" : "refund applied" };
      } catch (e) {
        if (e instanceof DomainError) {
          await openException(tx, tenantId, eventId, "החזר שלא ניתן להחיל אוטומטית.", { code: e.code, transactionId: t.transactionId }, original.congregantId);
          return { status: "exception" as const, note: e.code };
        }
        throw e;
      }
    });
  }

  // Charges: only a real completed charge reduces debt.
  if (t.status !== "charged") return { status: "ignored", note: `charge status ${t.status} – no ledger change` };

  return withContext(ctx, async (tx) => {
    const attempt = t.pageRef ? await tx.paymentAttempt.findUnique({ where: { tenantId_providerPageRef: { tenantId, providerPageRef: t.pageRef } } }) : null;
    const request = attempt ? await tx.paymentRequest.findUnique({ where: { id: attempt.paymentRequestId } }) : null;
    const problems: string[] = [];
    if (!request) problems.push("no matching payment request");
    if (request && request.integrationAccountId !== integration.id) problems.push("request belongs to another receiving account");
    if (t.currency !== "ILS") problems.push("currency mismatch");
    if (request && t.amountAgorot !== request.amountAgorot) problems.push("amount mismatch");
    if (problems.length) {
      await openException(tx, tenantId, eventId, "חיוב שהתקבל אך לא שויך אוטומטית – נדרש בירור.", {
        problems,
        transactionId: t.transactionId,
        amountAgorot: t.amountAgorot,
      }, request?.congregantId);
      return { status: "exception" as const, note: problems.join(", ") };
    }
    const r = await recordVerifiedCardPayment(tx, tenantId, PROVIDER_ACTOR, {
      congregantId: request!.congregantId,
      amountAgorot: t.amountAgorot,
      currency: t.currency,
      identity: { ...identity, transactionId: t.transactionId },
      integrationAccountId: integration.id,
      paymentRequestId: request!.id,
      preferPledgeIds: request!.pledgeIds,
      receivedAt: t.occurredAt,
    });
    await tx.paymentAttempt.update({ where: { id: attempt!.id }, data: { status: "completed", lastProviderStatus: t.status } });
    return { status: "processed" as const, note: r.duplicate ? "charge already recorded" : "charge recorded" };
  });
}

/** Browser closed / callback lost: ask the provider about open attempts directly. */
export async function pollOpenAttempts(tenantId: string, olderThanMinutes = 5) {
  const ctx = systemCtx(tenantId);
  const attempts = await withContext(ctx, (tx) =>
    tx.paymentAttempt.findMany({
      where: { status: "open", createdAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
      include: { request: true },
      take: 200,
    }),
  );
  let recorded = 0;
  for (const a of attempts) {
    const integration = await withContext(ctx, (tx) => tx.integrationAccount.findUniqueOrThrow({ where: { id: a.request.integrationAccountId } }));
    const txns = await paymentProvider(integration.provider).fetchTransaction(toIntegrationRef(integration), { pageRef: a.providerPageRef });
    for (const t of txns.filter((x) => x.accountId === integration.externalAccountId && x.operation === "charge")) {
      const r = await applyTransaction(tenantId, null, integration, t);
      if (r.note === "charge recorded") recorded++;
      // An exception task was opened; stop polling this attempt so the task is not duplicated.
      if (r.status === "exception")
        await withContext(ctx, (tx) => tx.paymentAttempt.update({ where: { id: a.id }, data: { status: "failed", lastProviderStatus: t.status } }));
    }
    if (txns.length === 0 && a.request.expiresAt < new Date(Date.now() - 24 * 3600_000)) {
      await withContext(ctx, async (tx) => {
        await tx.paymentAttempt.update({ where: { id: a.id }, data: { status: "expired" } });
        await tx.paymentRequest.updateMany({ where: { id: a.paymentRequestId, status: "open" }, data: { status: "expired" } });
      });
    }
  }
  return { checked: attempts.length, recorded };
}
