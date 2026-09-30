import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { asTenant, d, gabbai, makeCongregant, makeSubscription, makeTenant, truncateAll } from "./helpers";
import { connectIntegration, disconnectIntegration, integrationStatus } from "@/server/integrations/connect";
import { withContext } from "@/server/db/context";
import { createPledge } from "@/server/ledger/engine";
import { createPaymentRequest } from "@/server/payments/requests";
import { pollOpenAttempts } from "@/server/payments/process";
import { fakeCompleteCheckout } from "@/server/providers/fake-payment";
import { cardSummary } from "@/server/ledger/balance";

process.env.QUEUE_DISABLED = "true";
let tenantId: string;
const admin = { type: "platform_admin" as const, id: "admin-1" };
const asAdminInTenant = <T>(fn: Parameters<typeof withContext<T>>[1]) =>
  withContext({ kind: "tenant", tenantId, userId: "admin-1", actor: admin }, fn);
const fakePay = (ext: string, confirmReplace = false) => ({
  kind: "payment" as const,
  provider: "fake",
  externalAccountId: ext,
  secrets: { webhookSecret: "s3cret-value" },
  confirmReplace,
});

beforeEach(async () => {
  await truncateAll();
  tenantId = await makeTenant();
  await makeSubscription(tenantId);
});

describe("each synagogue connects its own accounts", () => {
  it("gabbai connects; credentials are encrypted and never returned", async () => {
    await asTenant(tenantId, (tx) => connectIntegration(tx, tenantId, gabbai(), fakePay("acct-a")));
    const raw = await asTenant(tenantId, (tx) => tx.integrationAccount.findFirstOrThrow());
    expect(raw.encryptedSecrets).not.toContain("s3cret-value");
    const status = await asTenant(tenantId, (tx) => integrationStatus(tx));
    expect(JSON.stringify(status)).not.toContain("encrypted");
    expect(status.payment).toMatchObject({ provider: "fake", externalAccountId: "acct-a", status: "active" });
  });

  it("platform admin can connect on the synagogue's behalf; it is audited", async () => {
    await asAdminInTenant((tx) => connectIntegration(tx, tenantId, admin, fakePay("acct-admin")));
    const logs = await asTenant(tenantId, (tx) => tx.auditLog.findMany({ where: { action: "integration.connect" } }));
    expect(logs[0]).toMatchObject({ actorType: "platform_admin", actorId: "admin-1" });
  });

  it("planned providers, missing fields and bad ids are refused", async () => {
    await expect(
      asTenant(tenantId, (tx) => connectIntegration(tx, tenantId, gabbai(), { ...fakePay("x1"), provider: "tranzila" })),
    ).rejects.toMatchObject({ code: "provider_planned" });
    await expect(asTenant(tenantId, (tx) => connectIntegration(tx, tenantId, gabbai(), { ...fakePay("x1"), secrets: {} }))).rejects.toMatchObject({
      code: "missing_field",
    });
    await expect(asTenant(tenantId, (tx) => connectIntegration(tx, tenantId, gabbai(), fakePay("bad id!")))).rejects.toMatchObject({ code: "bad_account" });
  });

  it("replacing requires explicit confirmation; a payment started on the old account still completes", async () => {
    await asTenant(tenantId, (tx) => connectIntegration(tx, tenantId, gabbai(), fakePay("old-acct")));
    const c = await makeCongregant(tenantId, { phone: "+972501231231" });
    await asTenant(tenantId, (tx) => createPledge(tx, tenantId, gabbai(), { congregantId: c.id, amountAgorot: 5000, pledgeDate: d("2026-09-01") }));
    const req = await createPaymentRequest({ kind: "portal", tenantId, congregantIds: [c.id], actor: { type: "congregant", id: c.id } }, {
      congregantId: c.id,
      idempotencyKey: randomUUID(),
      via: "portal",
    });
    await expect(asTenant(tenantId, (tx) => connectIntegration(tx, tenantId, gabbai(), fakePay("new-acct")))).rejects.toMatchObject({
      code: "confirm_replace",
    });
    await asTenant(tenantId, (tx) => connectIntegration(tx, tenantId, gabbai(), fakePay("new-acct", true)));
    await fakeCompleteCheckout(req.paymentUrl.split("/").pop()!, "charged");
    expect((await pollOpenAttempts(tenantId, 0)).recorded).toBe(1);
    expect((await asTenant(tenantId, (tx) => cardSummary(tx, c.id))).debtAgorot).toBe(0);
    const all = await asTenant(tenantId, (tx) => tx.integrationAccount.findMany({ orderBy: { createdAt: "asc" } }));
    expect(all.map((a) => a.status)).toEqual(["replaced", "active"]);
  });

  it("disconnect stops new payment requests", async () => {
    await asTenant(tenantId, (tx) => connectIntegration(tx, tenantId, gabbai(), fakePay("acct-z")));
    await asTenant(tenantId, (tx) => disconnectIntegration(tx, tenantId, gabbai(), "payment"));
    const c = await makeCongregant(tenantId);
    await asTenant(tenantId, (tx) => createPledge(tx, tenantId, gabbai(), { congregantId: c.id, amountAgorot: 100, pledgeDate: d("2026-09-01") }));
    await expect(
      createPaymentRequest({ kind: "portal", tenantId, congregantIds: [c.id], actor: { type: "congregant", id: c.id } }, { congregantId: c.id, idempotencyKey: randomUUID(), via: "portal" }),
    ).rejects.toMatchObject({ code: "no_payment_integration" });
  });

  it("another synagogue's accounts are invisible and untouchable", async () => {
    await asTenant(tenantId, (tx) => connectIntegration(tx, tenantId, gabbai(), fakePay("acct-a")));
    const other = await makeTenant("אחר");
    expect((await asTenant(other, (tx) => integrationStatus(tx))).payment).toBeNull();
    await expect(asTenant(other, (tx) => disconnectIntegration(tx, other, gabbai(), "payment"))).rejects.toMatchObject({ code: "not_connected" });
  });
});
