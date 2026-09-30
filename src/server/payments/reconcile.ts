import { systemCtx, withContext } from "../db/context";
import { paymentProvider, toIntegrationRef } from "../providers/registry";

/**
 * Daily reconciliation: compares provider transactions of a day with recorded payments/refunds.
 * Differences become "reconciliation" tasks. If the provider exposes no listing API (listTransactions → null),
 * a SupportCase notes that reconciliation must be done by CSV import – it is not presented as automated.
 */
export async function reconcileDay(tenantId: string, day: Date) {
  const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const to = new Date(from.getTime() + 86400_000);
  const ctx = systemCtx(tenantId);
  const accounts = await withContext(ctx, (tx) => tx.integrationAccount.findMany({ where: { kind: "payment", status: { in: ["active", "error", "replaced"] } } }));
  const diffs: { kind: string; transactionId: string }[] = [];
  for (const acct of accounts) {
    let txns;
    try {
      txns = await paymentProvider(acct.provider).listTransactions(toIntegrationRef(acct), from, to);
    } catch (e) {
      await withContext(ctx, (tx) =>
        tx.integrationAccount.update({ where: { id: acct.id }, data: { lastError: (e as Error).message.slice(0, 200), lastErrorAt: new Date() } }),
      );
      continue;
    }
    if (txns === null) {
      await withContext(ctx, (tx) =>
        tx.supportCase.create({ data: { tenantId, kind: "reconciliation", summary: `אין API להתאמה אוטומטית לחשבון ${acct.provider} – נדרש ייבוא דוח ידני.` } }),
      );
      continue;
    }
    await withContext(ctx, async (tx) => {
      for (const t of txns) {
        if (t.operation === "charge" && t.status === "charged") {
          const p = await tx.payment.findUnique({
            where: {
              provider_providerEnvironment_providerAccountId_providerTransactionId: {
                provider: acct.provider,
                providerEnvironment: acct.environment,
                providerAccountId: acct.externalAccountId,
                providerTransactionId: t.transactionId,
              },
            },
          });
          if (!p) diffs.push({ kind: "charge_missing", transactionId: t.transactionId });
          else if (p.amountAgorot !== t.amountAgorot) diffs.push({ kind: "amount_differs", transactionId: t.transactionId });
        }
        if (t.operation === "refund" && t.status === "refunded") {
          const r = await tx.refund.findFirst({ where: { providerRefundId: t.transactionId, providerAccountId: acct.externalAccountId } });
          if (!r) diffs.push({ kind: "refund_missing", transactionId: t.transactionId });
        }
      }
      if (diffs.length)
        await tx.task.create({
          data: { tenantId, kind: "reconciliation", summary: `נמצאו ${diffs.length} הבדלים מול ספק הסליקה ב-${from.toISOString().slice(0, 10)}`, details: { diffs } },
        });
    });
  }
  return { diffs };
}
