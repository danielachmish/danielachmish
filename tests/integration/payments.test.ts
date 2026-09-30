import { beforeEach, describe, expect, it } from "vitest";
import { asTenant, d, gabbai, makeCongregant, makeFakePaymentIntegration, makeSubscription, makeTenant, truncateAll } from "./helpers";
import { createPledge } from "@/server/ledger/engine";
import { cardSummary } from "@/server/ledger/balance";
import { createPaymentRequest, paymentRequestStatus } from "@/server/payments/requests";
import { receivePaymentCallback } from "@/server/payments/intake";
import { pollOpenAttempts, processPaymentEvent } from "@/server/payments/process";
import { fakeCallback, fakeCompleteCheckout, fakeRefund, FAKE_SIGNATURE_HEADER } from "@/server/providers/fake-payment";
import { toIntegrationRef } from "@/server/providers/registry";
import { tenantCtx, withContext } from "@/server/db/context";
import { randomUUID } from "node:crypto";

process.env.QUEUE_DISABLED = "true";
const ils = (n: number) => n * 100;

let tenantId: string;
let cardId: string;
let integration: Awaited<ReturnType<typeof makeFakePaymentIntegration>>;

const summary = () => asTenant(tenantId, (t) => cardSummary(t, cardId));
const portal = () => ({ kind: "portal" as const, tenantId, congregantIds: [cardId], actor: { type: "congregant" as const, id: cardId } });
const pageRefOf = (url: string) => url.split("/").pop()!;

async function deliver(body: Record<string, unknown>, opts: { sign?: boolean; account?: string } = {}) {
  const ref = toIntegrationRef(integration);
  const { raw, signature } = fakeCallback(opts.account ? { ...ref, externalAccountId: opts.account } : ref, body);
  const headers = new Headers(opts.sign === false ? {} : { [FAKE_SIGNATURE_HEADER]: signature });
  return receivePaymentCallback("fake", headers, raw);
}
async function deliverAndProcess(body: Record<string, unknown>, opts?: { sign?: boolean }) {
  const r = await deliver(body, opts);
  if (r.outcome === "accepted") await processPaymentEvent(r.tenantId, r.eventId);
  return r;
}

beforeEach(async () => {
  await truncateAll();
  tenantId = await makeTenant();
  await makeSubscription(tenantId);
  cardId = (await makeCongregant(tenantId, { phone: "+972501234567" })).id;
  integration = await makeFakePaymentIntegration(tenantId);
  await asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: cardId, amountAgorot: ils(300), pledgeDate: d("2026-09-01") }));
});

describe("card payment end to end (fake provider)", () => {
  it("pledge → request → charge → callback → balance reduced", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    await deliverAndProcess({ page_ref: txn.pageRef, transaction_id: txn.transactionId });
    expect(await summary()).toMatchObject({ debtAgorot: 0 });
    expect((await paymentRequestStatus(portal(), req.requestId)).status).toBe("paid");
    const outbox = await asTenant(tenantId, (t) => t.outbox.findMany());
    expect(outbox.map((o) => o.topic).sort()).toEqual(["payment_confirmation", "receipt"]);
  });

  it("double click on pay returns the same request and page", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.allSettled([
      createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: key, via: "portal" }),
      createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: key, via: "portal" }),
    ]);
    const ok = [a, b].filter((x) => x.status === "fulfilled");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const again = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: key, via: "portal" });
    expect(await asTenant(tenantId, (t) => t.paymentRequest.count())).toBe(1);
    expect(again.requestId).toBe((ok[0] as PromiseFulfilledResult<{ requestId: string }>).value.requestId);
  });

  it("partial amount", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, amountAgorot: ils(100), idempotencyKey: randomUUID(), via: "portal" });
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    await deliverAndProcess({ page_ref: txn.pageRef, transaction_id: txn.transactionId });
    expect((await summary()).debtAgorot).toBe(ils(200));
  });

  it("amount above the open balance is refused", async () => {
    await expect(
      createPaymentRequest(portal(), { congregantId: cardId, amountAgorot: ils(301), idempotencyKey: randomUUID(), via: "portal" }),
    ).rejects.toMatchObject({ code: "amount_exceeds_debt" });
  });

  it("same callback 10 times sequentially and concurrently → charge applied once", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    const body = { page_ref: txn.pageRef, transaction_id: txn.transactionId };
    for (let i = 0; i < 10; i++) await deliverAndProcess(body);
    // Different delivery bodies (e.g. provider re-sends with a new delivery id) for the same charge, concurrently:
    await Promise.all(Array.from({ length: 10 }, (_, i) => deliverAndProcess({ ...body, delivery: i })));
    const payments = await asTenant(tenantId, (t) => t.payment.findMany());
    expect(payments).toHaveLength(1);
    expect(await summary()).toMatchObject({ debtAgorot: 0, creditAgorot: 0 });
  });

  it("failure or authorisation only → no debt reduction", async () => {
    for (const outcome of ["failed", "authorized_only", "card_check"] as const) {
      const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
      const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), outcome);
      await deliverAndProcess({ page_ref: txn.pageRef, transaction_id: txn.transactionId });
    }
    expect((await summary()).debtAgorot).toBe(ils(300));
  });

  it("forged callback (bad signature) or a fake 'thank you' return never reduces debt", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    await deliverAndProcess({ page_ref: txn.pageRef, transaction_id: txn.transactionId }, { sign: false });
    expect((await summary()).debtAgorot).toBe(ils(300));
    const tasks = await asTenant(tenantId, (t) => t.task.findMany({ where: { kind: "provider_exception" } }));
    expect(tasks).toHaveLength(1);
    // The return page only reads status:
    expect((await paymentRequestStatus(portal(), req.requestId)).status).toBe("open");
  });

  it("callback claiming a charge that does not exist at the provider does not reduce debt", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    for (let i = 0; i < 8; i++) {
      const r = await deliver({ page_ref: pageRefOf(req.paymentUrl), transaction_id: "made-up", n: i });
      if (r.outcome === "accepted") for (let k = 0; k < 8; k++) await processPaymentEvent(r.tenantId, r.eventId);
    }
    expect((await summary()).debtAgorot).toBe(ils(300));
  });

  it("callback for an unknown account is stored as unrouted and changes nothing", async () => {
    const r = await deliver({ page_ref: "x", transaction_id: "y" }, { account: "someone-else" });
    expect(r.outcome).toBe("unrouted");
  });

  it("amount mismatch → exception, no automatic allocation", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged", { amountAgorot: ils(250) });
    await deliverAndProcess({ page_ref: txn.pageRef, transaction_id: txn.transactionId });
    expect((await summary()).debtAgorot).toBe(ils(300));
    const tasks = await asTenant(tenantId, (t) => t.task.findMany());
    expect(tasks[0]).toMatchObject({ kind: "provider_exception" });
  });

  it("browser closed and callback lost → poller records the charge", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    const r = await pollOpenAttempts(tenantId, 0);
    expect(r.recorded).toBe(1);
    expect((await summary()).debtAgorot).toBe(0);
    expect((await pollOpenAttempts(tenantId, 0)).recorded).toBe(0);
  });

  it("crash after storing the event, before processing → retry completes once", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    const r = await deliver({ page_ref: txn.pageRef, transaction_id: txn.transactionId });
    if (r.outcome !== "accepted") throw new Error("expected accepted");
    // "crash": nothing processed. Sweeper later runs processing twice concurrently.
    await Promise.all([processPaymentEvent(tenantId, r.eventId), processPaymentEvent(tenantId, r.eventId)]);
    expect(await asTenant(tenantId, (t) => t.payment.count())).toBe(1);
    expect((await summary()).debtAgorot).toBe(0);
  });

  it("late failure event after success does not undo the charge", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    const pageRef = pageRefOf(req.paymentUrl);
    const ok = await fakeCompleteCheckout(pageRef, "charged");
    await deliverAndProcess({ page_ref: pageRef, transaction_id: ok.txn.transactionId });
    const bad = await fakeCompleteCheckout(pageRef, "failed");
    await deliverAndProcess({ page_ref: pageRef, transaction_id: bad.txn.transactionId });
    expect((await summary()).debtAgorot).toBe(0);
  });

  it("refund via provider callback: partial refund re-opens only its amount; replay applies once", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    await deliverAndProcess({ page_ref: txn.pageRef, transaction_id: txn.transactionId });
    const rf = await fakeRefund(integration.externalAccountId, txn.transactionId, ils(100));
    for (let i = 0; i < 3; i++) await deliverAndProcess({ transaction_id: rf.transactionId, n: i });
    expect((await summary()).debtAgorot).toBe(ils(100));
  });

  it("refund that arrives before the charge is held and completed later", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    const rf = await fakeRefund(integration.externalAccountId, txn.transactionId, ils(300));
    // Refund callback only (it names the refund; fetch by refund id returns only the refund)
    const r1 = await deliver({ transaction_id: rf.transactionId });
    if (r1.outcome !== "accepted") throw new Error();
    const first = await processPaymentEvent(tenantId, r1.eventId);
    expect(first.status).toBe("retry");
    await deliverAndProcess({ page_ref: txn.pageRef, transaction_id: txn.transactionId });
    await processPaymentEvent(tenantId, r1.eventId);
    expect(await summary()).toMatchObject({ debtAgorot: ils(300), creditAgorot: 0 });
  });

  it("suspended subscription blocks new requests but a pending charge still completes", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    await makeSubscription(tenantId, "suspended");
    await expect(createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" })).rejects.toMatchObject({
      code: "subscription_inactive",
    });
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    await deliverAndProcess({ page_ref: txn.pageRef, transaction_id: txn.transactionId });
    expect((await summary()).debtAgorot).toBe(0);
  });

  it("payment after the pledge was reduced meanwhile → charge recorded, excess becomes credit", async () => {
    const req = await createPaymentRequest(portal(), { congregantId: cardId, idempotencyKey: randomUUID(), via: "portal" });
    const pledge = await asTenant(tenantId, (t) => t.pledge.findFirstOrThrow());
    const { adjustPledge } = await import("@/server/ledger/engine");
    await asTenant(tenantId, (t) => adjustPledge(t, tenantId, gabbai(), { pledgeId: pledge.id, deltaAgorot: -ils(100), reason: "תיקון" }));
    const { txn } = await fakeCompleteCheckout(pageRefOf(req.paymentUrl), "charged");
    await deliverAndProcess({ page_ref: txn.pageRef, transaction_id: txn.transactionId });
    expect(await summary()).toMatchObject({ debtAgorot: 0, creditAgorot: ils(100) });
  });

  it("congregant cannot create a request for another card", async () => {
    const other = await makeCongregant(tenantId, { firstName: "אחר" });
    await asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: other.id, amountAgorot: ils(50), pledgeDate: d("2026-09-01") }));
    await expect(createPaymentRequest(portal(), { congregantId: other.id, idempotencyKey: randomUUID(), via: "portal" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await withContext(tenantCtx(tenantId, gabbai()), (t) => t.paymentRequest.count())).toBe(0);
  });
});
