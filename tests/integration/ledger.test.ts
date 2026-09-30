import { beforeEach, describe, expect, it } from "vitest";
import { asTenant, d, gabbai, makeCongregant, makeTenant, truncateAll } from "./helpers";
import {
  adjustPledge,
  applyVerifiedRefund,
  createPledge,
  decideExternalPayment,
  recordVerifiedCardPayment,
  reportExternalPayment,
} from "@/server/ledger/engine";
import { cardSummary, loadCard, pledgeFigures } from "@/server/ledger/balance";
import { withContext, tenantCtx } from "@/server/db/context";

const ils = (n: number) => n * 100;
let tenantId: string;
let cardId: string;
let integrationId: string;
let tx = 0;

async function pay(amount: number, extra: { txId?: string; prefer?: string[] } = {}) {
  return asTenant(tenantId, (t) =>
    recordVerifiedCardPayment(t, tenantId, { type: "provider", id: "fake" }, {
      congregantId: cardId,
      amountAgorot: ils(amount),
      currency: "ILS",
      integrationAccountId: integrationId,
      identity: { provider: "fake", environment: "fake", accountId: "acc-1", transactionId: extra.txId ?? `tx-${++tx}` },
      preferPledgeIds: extra.prefer,
    }),
  );
}
const pledge = (amount: number, date = "2026-09-01", clientOpId?: string) =>
  asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: cardId, amountAgorot: ils(amount), pledgeDate: d(date), clientOpId }));
const summary = () => asTenant(tenantId, (t) => cardSummary(t, cardId));

beforeEach(async () => {
  await truncateAll();
  tenantId = await makeTenant();
  cardId = (await makeCongregant(tenantId)).id;
  integrationId = (
    await asTenant(tenantId, (t) =>
      t.integrationAccount.create({ data: { tenantId, kind: "payment", provider: "fake", environment: "fake", externalAccountId: "acc-1" } }),
    )
  ).id;
});

describe("ledger acceptance scenarios", () => {
  it("debt 300, verified payment 300 → balance 0, full allocation", async () => {
    await pledge(300);
    const r = await pay(300);
    expect(r.allocations).toEqual([expect.objectContaining({ amountAgorot: ils(300) })]);
    expect(await summary()).toMatchObject({ debtAgorot: 0, creditAgorot: 0, balanceAgorot: 0 });
  });

  it("debt 300, payment 100 → balance 200", async () => {
    await pledge(300);
    await pay(100);
    expect(await summary()).toMatchObject({ debtAgorot: ils(200), creditAgorot: 0 });
  });

  it("pledges 180 + 120, payment 200 then 100 → 100 then 0", async () => {
    const a = await pledge(180, "2026-09-01");
    const b = await pledge(120, "2026-09-02");
    const r = await pay(200);
    expect(r.allocations.map((x) => [x.pledgeId, x.amountAgorot])).toEqual([
      [a.pledge.id, ils(180)],
      [b.pledge.id, ils(20)],
    ]);
    expect((await summary()).debtAgorot).toBe(ils(100));
    await pay(100);
    expect(await summary()).toMatchObject({ debtAgorot: 0, creditAgorot: 0 });
  });

  it("payment directed to chosen pledge first", async () => {
    await pledge(180, "2026-09-01");
    const b = await pledge(120, "2026-09-02");
    const r = await pay(120, { prefer: [b.pledge.id] });
    expect(r.allocations).toEqual([expect.objectContaining({ pledgeId: b.pledge.id, amountAgorot: ils(120) })]);
  });

  it("two different verified charges of 300 for debt 300 → both kept, debt 0, credit 300", async () => {
    await pledge(300);
    await pay(300);
    await pay(300);
    expect(await summary()).toMatchObject({ debtAgorot: 0, creditAgorot: ils(300), balanceAgorot: -ils(300) });
  });

  it("same provider transaction replayed 10 times sequentially and concurrently is applied once", async () => {
    await pledge(300);
    for (let i = 0; i < 10; i++) await pay(100, { txId: "same" });
    await Promise.all(Array.from({ length: 10 }, () => pay(100, { txId: "same-2" })));
    const card = await asTenant(tenantId, (t) => loadCard(t, cardId));
    expect(card.payments).toHaveLength(2);
    expect(card.summary.debtAgorot).toBe(ils(100));
  });

  it("concurrent different payments never over-allocate a pledge", async () => {
    const p = await pledge(300);
    await Promise.all([pay(200), pay(200), pay(200)]);
    const card = await asTenant(tenantId, (t) => loadCard(t, cardId));
    const f = pledgeFigures(card.pledges.find((x) => x.id === p.pledge.id)!);
    expect(f.allocated).toBe(ils(300));
    expect(card.summary.creditAgorot).toBe(ils(300));
  });

  it("existing credit is applied to a new pledge", async () => {
    await pay(50);
    await pledge(80);
    expect(await summary()).toMatchObject({ debtAgorot: ils(30), creditAgorot: 0 });
  });

  it("double click on save pledge with same clientOpId creates one pledge; new op id creates another identical one", async () => {
    await pledge(50, "2026-09-01", "op-1");
    await pledge(50, "2026-09-01", "op-1");
    await pledge(50, "2026-09-01", "op-2");
    const card = await asTenant(tenantId, (t) => loadCard(t, cardId));
    expect(card.pledges).toHaveLength(2);
  });
});

describe("corrections", () => {
  it("requires a reason and keeps history", async () => {
    const p = await pledge(100);
    await expect(
      asTenant(tenantId, (t) => adjustPledge(t, tenantId, gabbai(), { pledgeId: p.pledge.id, deltaAgorot: -1000, reason: " " })),
    ).rejects.toMatchObject({ code: "reason_required" });
    await asTenant(tenantId, (t) => adjustPledge(t, tenantId, gabbai(), { pledgeId: p.pledge.id, deltaAgorot: -ils(40), reason: "טעות הקלדה" }));
    expect((await summary()).debtAgorot).toBe(ils(60));
  });

  it("reducing a paid pledge stops for a decision, then releases excess to credit", async () => {
    const p = await pledge(100);
    await pay(100);
    await expect(
      asTenant(tenantId, (t) => adjustPledge(t, tenantId, gabbai(), { pledgeId: p.pledge.id, deltaAgorot: -ils(30), reason: "תיקון" })),
    ).rejects.toMatchObject({ code: "pledge_already_paid" });
    await asTenant(tenantId, (t) =>
      adjustPledge(t, tenantId, gabbai(), { pledgeId: p.pledge.id, deltaAgorot: -ils(30), reason: "תיקון", onExcess: "release_to_credit" }),
    );
    expect(await summary()).toMatchObject({ debtAgorot: 0, creditAgorot: ils(30) });
  });

  it("pledge amount cannot be updated directly by the runtime role", async () => {
    const p = await pledge(100);
    await expect(asTenant(tenantId, (t) => t.pledge.update({ where: { id: p.pledge.id }, data: { amountAgorot: 1 } }))).rejects.toThrow();
  });

  it("settled payments and allocations cannot be deleted by the runtime role", async () => {
    await pledge(100);
    const r = await pay(100);
    await expect(asTenant(tenantId, (t) => t.payment.delete({ where: { id: r.payment.id } }))).rejects.toThrow();
    await expect(asTenant(tenantId, (t) => t.allocation.deleteMany({}))).rejects.toThrow();
  });
});

describe("external payments", () => {
  it("cash reported by congregant does not reduce debt until gabbai approves", async () => {
    await pledge(300);
    const r = await withContext({ kind: "portal", tenantId, congregantIds: [cardId], actor: { type: "congregant", id: cardId } }, (t) =>
      reportExternalPayment(t, tenantId, { type: "congregant", id: cardId }, { congregantId: cardId, amountAgorot: ils(100), method: "cash" }),
    );
    expect(await summary()).toMatchObject({ debtAgorot: ils(300), pendingExternalAgorot: ils(100) });
    const tasks = await asTenant(tenantId, (t) => t.task.findMany({ where: { status: "open" } }));
    expect(tasks[0]).toMatchObject({ kind: "external_payment", pausesReminders: true });
    await asTenant(tenantId, (t) => decideExternalPayment(t, tenantId, gabbai(), { paymentId: r.payment.id, approve: true }));
    expect(await summary()).toMatchObject({ debtAgorot: ils(200), pendingExternalAgorot: 0 });
  });

  it("rejected check never reduces debt", async () => {
    await pledge(300);
    const r = await asTenant(tenantId, (t) =>
      reportExternalPayment(t, tenantId, gabbai(), { congregantId: cardId, amountAgorot: ils(300), method: "check", reference: "123" }),
    );
    await asTenant(tenantId, (t) => decideExternalPayment(t, tenantId, gabbai(), { paymentId: r.payment.id, approve: false, reason: "צ'ק חזר" }));
    expect((await summary()).debtAgorot).toBe(ils(300));
  });
});

describe("refunds", () => {
  const refund = (paymentId: string, amount: number, refundId?: string) =>
    asTenant(tenantId, (t) =>
      applyVerifiedRefund(t, tenantId, { type: "provider", id: "fake" }, {
        paymentId,
        amountAgorot: ils(amount),
        identity: refundId ? { provider: "fake", environment: "fake", accountId: "acc-1", refundId } : undefined,
      }),
    );

  it("payment 300, refund 100 → re-opens exactly 100", async () => {
    await pledge(300);
    const r = await pay(300);
    await refund(r.payment.id, 100, "rf-1");
    expect(await summary()).toMatchObject({ debtAgorot: ils(100), creditAgorot: 0 });
  });

  it("refund consumes unallocated credit first", async () => {
    await pledge(100);
    const r = await pay(150);
    await refund(r.payment.id, 50, "rf-1");
    expect(await summary()).toMatchObject({ debtAgorot: 0, creditAgorot: 0 });
  });

  it("duplicate and concurrent refunds are applied once and never exceed the payment", async () => {
    await pledge(300);
    const r = await pay(300);
    await Promise.allSettled(Array.from({ length: 5 }, () => refund(r.payment.id, 100, "rf-same")));
    expect((await summary()).debtAgorot).toBe(ils(100));
    const results = await Promise.allSettled([refund(r.payment.id, 150, "rf-a"), refund(r.payment.id, 150, "rf-b")]);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect((await summary()).debtAgorot).toBe(ils(250));
  });

  it("refund does not reopen debt that another payment covers", async () => {
    await pledge(100);
    const a = await pay(100);
    await pay(100); // credit 100
    await refund(a.payment.id, 100, "rf-1");
    expect(await summary()).toMatchObject({ debtAgorot: 0, creditAgorot: 0 });
  });
});

describe("tenant context", () => {
  it("no context → no business rows", async () => {
    await pledge(100);
    const { prisma } = await import("@/server/db/client");
    expect(await prisma.pledge.findMany()).toHaveLength(0);
    expect(await prisma.congregant.count()).toBe(0);
  });

  it("context does not leak to the next transaction on a pooled connection", async () => {
    await pledge(100);
    await withContext(tenantCtx(tenantId, gabbai()), async (t) => expect(await t.pledge.count()).toBe(1));
    const { prisma } = await import("@/server/db/client");
    const leaks = await Promise.all(Array.from({ length: 20 }, () => prisma.pledge.count()));
    expect(leaks.every((n) => n === 0)).toBe(true);
  });
});
