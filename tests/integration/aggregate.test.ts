import { beforeAll, describe, expect, it } from "vitest";
import { asTenant, d, gabbai, makeCongregant, makeTenant, truncateAll } from "./helpers";
import { adjustPledge, applyVerifiedRefund, createPledge, decideExternalPayment, recordVerifiedCardPayment, reportExternalPayment } from "@/server/ledger/engine";
import { cardSummary } from "@/server/ledger/balance";
import { byCategory, cardSummaries, debtAging, monthlyReport } from "@/server/ledger/aggregate";

let tenantId: string;
const ids: string[] = [];
let tx = 0;

beforeAll(async () => {
  await truncateAll();
  tenantId = await makeTenant();
  const acc = await asTenant(tenantId, (t) =>
    t.integrationAccount.create({ data: { tenantId, kind: "payment", provider: "fake", environment: "fake", externalAccountId: "agg" } }),
  );
  const pay = (c: string, a: number) =>
    asTenant(tenantId, (t) =>
      recordVerifiedCardPayment(t, tenantId, { type: "provider", id: "x" }, {
        congregantId: c, amountAgorot: a, currency: "ILS", integrationAccountId: acc.id,
        identity: { provider: "fake", environment: "fake", accountId: "agg", transactionId: `t${++tx}` },
      }),
    );
  // A spread of situations: open debt, partial, credit, adjusted, refunded, pending and rejected external payments.
  for (let i = 0; i < 6; i++) ids.push((await makeCongregant(tenantId, { firstName: `c${i}` })).id);
  const pl = (c: string, a: number, date: string, category?: string) =>
    asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: c, amountAgorot: a, pledgeDate: d(date), category }));
  await pl(ids[0]!, 30000, "2026-01-10", "עלייה");
  await pl(ids[1]!, 18000, "2026-06-01", "עלייה");
  await pay(ids[1]!, 5000);
  await pay(ids[2]!, 9000);
  await pl(ids[2]!, 4000, "2026-09-20", "קידוש");
  const p3 = await pl(ids[3]!, 10000, "2026-08-01");
  await pay(ids[3]!, 10000);
  await asTenant(tenantId, (t) => adjustPledge(t, tenantId, gabbai(), { pledgeId: p3.pledge.id, deltaAgorot: -3000, reason: "x", onExcess: "release_to_credit" }));
  await pl(ids[4]!, 20000, "2026-03-01");
  const r = await pay(ids[4]!, 20000);
  await asTenant(tenantId, (t) => applyVerifiedRefund(t, tenantId, { type: "provider", id: "x" }, { paymentId: r.payment.id, amountAgorot: 7000 }));
  await pl(ids[5]!, 15000, "2026-09-01");
  await asTenant(tenantId, (t) => reportExternalPayment(t, tenantId, gabbai(), { congregantId: ids[5]!, amountAgorot: 4000, method: "check" }));
  const rej = await asTenant(tenantId, (t) => reportExternalPayment(t, tenantId, gabbai(), { congregantId: ids[5]!, amountAgorot: 1000, method: "cash" }));
  await asTenant(tenantId, (t) => decideExternalPayment(t, tenantId, gabbai(), { paymentId: rej.payment.id, approve: false }));
});

describe("set-based aggregates match the per-card ledger rules", () => {
  it("cardSummaries equals cardSummary for every card", async () => {
    const all = await asTenant(tenantId, (t) => cardSummaries(t));
    for (const id of ids) expect(all.get(id), id).toEqual(await asTenant(tenantId, (t) => cardSummary(t, id)));
  });

  it("reports add up", async () => {
    const months = await asTenant(tenantId, (t) => monthlyReport(t, 12));
    expect(months).toHaveLength(12);
    const collected = months.reduce((s, m) => s + m.collectedAgorot, 0);
    expect(collected).toBe(5000 + 9000 + 10000 + 20000);
    expect(months.reduce((s, m) => s + m.refundedAgorot, 0)).toBe(7000);
    const aging = await asTenant(tenantId, (t) => debtAging(t));
    const all = await asTenant(tenantId, (t) => cardSummaries(t));
    expect(aging.reduce((s, b) => s + b.outstandingAgorot, 0)).toBe([...all.values()].reduce((s, c) => s + c.debtAgorot, 0));
    const cats = await asTenant(tenantId, (t) => byCategory(t));
    expect(cats.find((c) => c.category === "עלייה")).toMatchObject({ pledgedAgorot: 48000, paidAgorot: 5000 + 0 });
  });
});
