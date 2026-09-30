import type { Tx } from "../db/client";
import type { CardSummary } from "./balance";

// Set-based versions of the balance rules in balance.ts, for lists, dashboards and reports.
// Same definitions: debt = Σ(pledge + adjustments − allocations); credit = Σ max(0, confirmed net − allocations);
// pending = Σ amounts awaiting gabbai approval. Runs under the caller's RLS context.
export async function cardSummaries(tx: Tx): Promise<Map<string, CardSummary>> {
  const rows = await tx.$queryRaw<{ id: string; debt: bigint; credit: bigint; pending: bigint }[]>`
    WITH adj AS (SELECT "pledgeId", SUM("deltaAgorot") s FROM "Adjustment" GROUP BY 1),
    alp AS (SELECT "pledgeId", SUM("amountAgorot") s FROM "Allocation" GROUP BY 1),
    alpay AS (SELECT "paymentId", SUM("amountAgorot") s FROM "Allocation" GROUP BY 1),
    ref AS (SELECT "paymentId", SUM("amountAgorot") s FROM "Refund" GROUP BY 1),
    debt AS (
      SELECT p."congregantId" c, SUM(p."amountAgorot" + COALESCE(adj.s, 0) - COALESCE(alp.s, 0)) d
      FROM "Pledge" p LEFT JOIN adj ON adj."pledgeId" = p.id LEFT JOIN alp ON alp."pledgeId" = p.id GROUP BY 1),
    pay AS (
      SELECT py."congregantId" c,
        SUM(CASE WHEN py.status = 'confirmed' THEN GREATEST(py."amountAgorot" - COALESCE(ref.s, 0) - COALESCE(alpay.s, 0), 0) ELSE 0 END) cr,
        SUM(CASE WHEN py.status = 'pending_approval' THEN py."amountAgorot" ELSE 0 END) pend
      FROM "Payment" py LEFT JOIN ref ON ref."paymentId" = py.id LEFT JOIN alpay ON alpay."paymentId" = py.id GROUP BY 1)
    SELECT c.id, COALESCE(debt.d, 0)::bigint debt, COALESCE(pay.cr, 0)::bigint credit, COALESCE(pay.pend, 0)::bigint pending
    FROM "Congregant" c LEFT JOIN debt ON debt.c = c.id LEFT JOIN pay ON pay.c = c.id`;
  const m = new Map<string, CardSummary>();
  for (const r of rows) {
    const debt = Number(r.debt);
    const credit = Number(r.credit);
    m.set(r.id, { debtAgorot: debt, creditAgorot: credit, pendingExternalAgorot: Number(r.pending), balanceAgorot: debt - credit });
  }
  return m;
}

const TZ = "Asia/Jerusalem";

export type MonthRow = { month: string; collectedAgorot: number; refundedAgorot: number; pledgedAgorot: number; payments: number };

/** Last N months: money collected (confirmed payments by receipt date), refunds, and new pledges. */
export async function monthlyReport(tx: Tx, months = 12): Promise<MonthRow[]> {
  const rows = await tx.$queryRaw<{ ym: string; collected: bigint; refunded: bigint; pledged: bigint; payments: bigint }[]>`
    WITH m AS (
      SELECT to_char(g, 'YYYY-MM') AS ym FROM generate_series(
        date_trunc('month', (now() AT TIME ZONE ${TZ})) - make_interval(months => ${months - 1}::int),
        date_trunc('month', (now() AT TIME ZONE ${TZ})), interval '1 month') AS g),
    p AS (SELECT to_char("receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}, 'YYYY-MM') AS ym, SUM("amountAgorot") AS s, COUNT(*) AS n
          FROM "Payment" WHERE status = 'confirmed' GROUP BY 1),
    r AS (SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}, 'YYYY-MM') AS ym, SUM("amountAgorot") AS s FROM "Refund" GROUP BY 1),
    pl AS (SELECT to_char("pledgeDate", 'YYYY-MM') AS ym, SUM("amountAgorot") AS s FROM "Pledge" GROUP BY 1)
    SELECT m.ym, COALESCE(p.s, 0)::bigint AS collected, COALESCE(r.s, 0)::bigint AS refunded, COALESCE(pl.s, 0)::bigint AS pledged, COALESCE(p.n, 0)::bigint AS payments
    FROM m LEFT JOIN p USING (ym) LEFT JOIN r USING (ym) LEFT JOIN pl USING (ym) ORDER BY m.ym DESC`;
  return rows.map((r) => ({
    month: r.ym,
    collectedAgorot: Number(r.collected),
    refundedAgorot: Number(r.refunded),
    pledgedAgorot: Number(r.pledged),
    payments: Number(r.payments),
  }));
}

export type AgingBucket = { bucket: "0-30" | "31-90" | "91-180" | "181+"; outstandingAgorot: number; pledges: number };

/** Open debt by age of the pledge (due date, or pledge date when there is none). */
export async function debtAging(tx: Tx): Promise<AgingBucket[]> {
  const rows = await tx.$queryRaw<{ bucket: AgingBucket["bucket"]; s: bigint; n: bigint }[]>`
    WITH o AS (
      SELECT p.id, COALESCE(p."dueDate", p."pledgeDate") d,
        p."amountAgorot" + COALESCE((SELECT SUM("deltaAgorot") FROM "Adjustment" a WHERE a."pledgeId" = p.id), 0)
          - COALESCE((SELECT SUM("amountAgorot") FROM "Allocation" x WHERE x."pledgeId" = p.id), 0) open
      FROM "Pledge" p)
    SELECT CASE WHEN current_date - d <= 30 THEN '0-30' WHEN current_date - d <= 90 THEN '31-90'
                WHEN current_date - d <= 180 THEN '91-180' ELSE '181+' END bucket,
           SUM(open)::bigint s, COUNT(*)::bigint n
    FROM o WHERE open > 0 GROUP BY 1`;
  const order: AgingBucket["bucket"][] = ["0-30", "31-90", "91-180", "181+"];
  return order.map((b) => {
    const r = rows.find((x) => x.bucket === b);
    return { bucket: b, outstandingAgorot: Number(r?.s ?? 0), pledges: Number(r?.n ?? 0) };
  });
}

/** Pledged / paid / open per category (or "ללא סוג"). */
export async function byCategory(tx: Tx) {
  const rows = await tx.$queryRaw<{ category: string; pledged: bigint; paid: bigint; n: bigint }[]>`
    SELECT COALESCE(NULLIF(trim(p.category), ''), CASE WHEN p.kind = 'opening_balance' THEN 'יתרת פתיחה' ELSE 'ללא סוג' END) category,
      SUM(p."amountAgorot" + COALESCE((SELECT SUM("deltaAgorot") FROM "Adjustment" a WHERE a."pledgeId" = p.id), 0))::bigint pledged,
      SUM(COALESCE((SELECT SUM("amountAgorot") FROM "Allocation" x WHERE x."pledgeId" = p.id), 0))::bigint paid,
      COUNT(*)::bigint n
    FROM "Pledge" p GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ category: r.category, pledgedAgorot: Number(r.pledged), paidAgorot: Number(r.paid), openAgorot: Number(r.pledged) - Number(r.paid), pledges: Number(r.n) }));
}
