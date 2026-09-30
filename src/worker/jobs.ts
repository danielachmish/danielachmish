import { prisma } from "../server/db/client";
import { systemCtx, withContext } from "../server/db/context";
import { processPaymentEvent, pollOpenAttempts } from "../server/payments/process";
import { processMessagingEvent } from "../server/messaging/bot";
import { processOutbox } from "../server/outbox";
import { dispatchMessage, dueMessages, markStuckSending, scanReminders } from "../server/reminders/service";
import { runSubscriptionCycle } from "../server/billing/subscriptions";
import { reconcileDay } from "../server/payments/reconcile";

// Job handlers. Each is idempotent and runs inside an explicit tenant (or system) context.

export async function tenantIds(): Promise<string[]> {
  return (await prisma.$queryRaw<{ list_tenant_ids: string }[]>`SELECT list_tenant_ids()`).map((r) => r.list_tenant_ids);
}

export async function handleProviderEvent({ tenantId, eventId }: { tenantId: string; eventId: string }) {
  const ev = await withContext(systemCtx(tenantId), (tx) => tx.providerEvent.findUnique({ where: { id: eventId } }));
  if (!ev) return;
  if (ev.kind === "whatsapp_inbound") {
    const replies = await processMessagingEvent(tenantId, eventId);
    for (const id of replies) await dispatchMessage(tenantId, id);
  } else {
    await processPaymentEvent(tenantId, eventId);
  }
}

/** Every minute: recover anything whose enqueue was lost, send due messages, run outbox. */
export async function sweep() {
  for (const tenantId of await tenantIds()) {
    const stale = await withContext(systemCtx(tenantId), (tx) =>
      tx.providerEvent.findMany({ where: { status: "received", receivedAt: { lt: new Date(Date.now() - 60_000) } }, take: 100 }),
    );
    for (const ev of stale) await handleProviderEvent({ tenantId, eventId: ev.id }).catch((e) => logError("provider-event", e));
    const created = await processOutbox(tenantId).catch((e) => (logError("outbox", e), [] as string[]));
    for (const m of [...created, ...(await dueMessages(tenantId)).map((x) => x.id)])
      await dispatchMessage(tenantId, m).catch((e) => logError("dispatch", e));
    await markStuckSending(tenantId);
  }
}

export async function reminderScanAll() {
  for (const t of await tenantIds()) await scanReminders(t).catch((e) => logError("reminder-scan", e));
}
export async function pollOpenPaymentsAll() {
  for (const t of await tenantIds()) await pollOpenAttempts(t).catch((e) => logError("poll-open", e));
}
export async function subscriptionsAll() {
  for (const t of await tenantIds()) await runSubscriptionCycle(t).catch((e) => logError("subscriptions", e));
}
export async function reconcileAll() {
  const day = new Date(Date.now() - 86400_000);
  for (const t of await tenantIds()) await reconcileDay(t, day).catch((e) => logError("reconcile", e));
}

// Logs never include personal or financial details – only job name and error class/message.
export function logError(job: string, e: unknown) {
  console.error(JSON.stringify({ level: "error", job, error: (e as Error)?.name, message: (e as Error)?.message?.slice(0, 200) }));
}
