import { systemCtx, withContext } from "./db/context";
import { receiptProvider } from "./providers/registry";
import { formatILS } from "./money";
import { tenantSettings } from "./settings";

const MAX_ATTEMPTS = 5;

/** Processes pending outbox rows of a tenant. Each row is claimed with SKIP LOCKED so workers never double-process. */
export async function processOutbox(tenantId: string) {
  const ctx = systemCtx(tenantId);
  const created: string[] = [];
  for (;;) {
    const row = await withContext(ctx, async (tx) => {
      const r = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Outbox" WHERE status = 'pending' AND "availableAt" <= now() ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!r[0]) return null;
      const o = await tx.outbox.findUniqueOrThrow({ where: { id: r[0].id } });
      try {
        const msgId = await handle(tx, tenantId, o.topic, o.payload as Record<string, string>);
        if (msgId) created.push(msgId);
        await tx.outbox.update({ where: { id: o.id }, data: { status: "done", doneAt: new Date(), attempts: { increment: 1 } } });
      } catch (e) {
        const attempts = o.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await tx.outbox.update({
          where: { id: o.id },
          data: {
            attempts,
            lastError: (e as Error).message.slice(0, 300),
            status: failed ? "failed" : "pending",
            availableAt: new Date(Date.now() + 2 ** attempts * 30_000),
          },
        });
        if (failed && o.topic === "receipt") {
          const payload = o.payload as { paymentId: string };
          const p = await tx.payment.findUnique({ where: { id: payload.paymentId } });
          await tx.task.create({
            data: { tenantId, kind: "receipt_failed", paymentId: payload.paymentId, congregantId: p?.congregantId ?? null, summary: "הפקת קבלה נכשלה – התשלום נרשם, יש לנסות שוב.", details: { outboxId: o.id } },
          });
        }
      }
      return o.id;
    });
    if (!row) break;
  }
  return created;
}

async function handle(tx: Parameters<Parameters<typeof withContext>[1]>[0], tenantId: string, topic: string, payload: Record<string, string>) {
  if (topic === "payment_confirmation") {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: payload.paymentId! } });
    const c = await tx.congregant.findUniqueOrThrow({ where: { id: p.congregantId } });
    if (!c.phone || c.messagingOptOut) return null;
    if (!(await tenantSettings(tx, tenantId)).paymentConfirmationMessage) return null;
    const r = await tx.outboundMessage.createMany({
      data: [
        {
          tenantId,
          congregantId: c.id,
          kind: "confirmation",
          idempotencyKey: `confirm:${p.id}`,
          scheduledFor: new Date(),
          body: {
            text: `התקבל תשלום של ${formatILS(p.amountAgorot)}. תודה!`,
            template: { name: "payment_confirmation", params: [formatILS(p.amountAgorot), (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).name] },
          },
        },
      ],
      skipDuplicates: true,
    });
    if (!r.count) return null;
    return (await tx.outboundMessage.findUniqueOrThrow({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: `confirm:${p.id}` } } })).id;
  }
  if (topic === "receipt") {
    const provider = receiptProvider();
    if (!provider) return null; // no receipt service connected (open decision) – nothing to do
    if (!(await tenantSettings(tx, tenantId)).autoReceipts) return null; // gabbai issues receipts himself
    const p = await tx.payment.findUniqueOrThrow({ where: { id: payload.paymentId! } });
    const c = await tx.congregant.findUniqueOrThrow({ where: { id: p.congregantId } });
    await provider.issueReceipt({ tenantId, paymentId: p.id, amountAgorot: p.amountAgorot, payerName: `${c.firstName} ${c.lastName}`, method: p.method });
    return null;
  }
  throw new Error(`unknown outbox topic ${topic}`);
}
