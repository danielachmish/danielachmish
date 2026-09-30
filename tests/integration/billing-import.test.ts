import { beforeEach, describe, expect, it } from "vitest";
import { asTenant, d, gabbai, makeCongregant, makeTenant, truncateAll } from "./helpers";
import { onboardTenant, replaceHeadGabbai, adminOverview } from "@/server/admin/tenants";
import { runSubscriptionCycle, recordManualSubscriptionPayment, setSubscriptionStatus } from "@/server/billing/subscriptions";
import { withContext } from "@/server/db/context";
import { commitCongregantImport, exportBalancesCsv, exportLedgerCsv, previewCongregantImport } from "@/server/gabbai/import-export";
import { createPledge } from "@/server/ledger/engine";
import { prisma } from "@/server/db/client";

const admin = { type: "platform_admin" as const, id: "admin-1" };
const DAY = 86400_000;

async function user(id: string) {
  await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  return id;
}

beforeEach(truncateAll);

describe("subscriptions (separate money domain)", () => {
  it("trial → invoice → fake charge → active; failure → grace → suspended; manual payment → active", async () => {
    process.env.SAAS_PLAN_PRICE_AGOROT = "10000";
    const t = await onboardTenant(admin, { name: "בית כנסת", headGabbaiUserId: await user("g1") });
    const after = new Date(Date.now() + 40 * DAY);
    // price comes from configuration; with price 0 an invoice is auto-settled
    const r = await runSubscriptionCycle(t.id, after);
    expect(r.action).toBe("paid");
    const sub = await withContext({ kind: "system", tenantId: t.id }, (tx) => tx.saaSSubscription.findUniqueOrThrow({ where: { tenantId: t.id } }));
    expect(sub.status).toBe("active");

    process.env.FAKE_SAAS_CHARGE_FAIL = "true";
    const next = new Date(sub.currentPeriodEnd!.getTime() + DAY);
    const failed = await runSubscriptionCycle(t.id, next);
    process.env.FAKE_SAAS_CHARGE_FAIL = "";
    expect(failed.action).toBe("charge_failed");
    {
      const s2 = await withContext({ kind: "system", tenantId: t.id }, (tx) => tx.saaSSubscription.findUniqueOrThrow({ where: { tenantId: t.id } }));
      expect(s2.status).toBe("grace");
      expect((await runSubscriptionCycle(t.id, new Date(s2.graceEndsAt!.getTime() + DAY))).action).toBe("suspended");
      const inv = await withContext({ kind: "system", tenantId: t.id }, (tx) => tx.saaSInvoice.findFirstOrThrow({ where: { status: "open" } }));
      await recordManualSubscriptionPayment("admin-1", t.id, inv.id, "העברה 123");
      const s3 = await withContext({ kind: "system", tenantId: t.id }, (tx) => tx.saaSSubscription.findUniqueOrThrow({ where: { tenantId: t.id } }));
      expect(s3.status).toBe("active");
    }
    process.env.SAAS_PLAN_PRICE_AGOROT = "0";
  });

  it("failed subscription charge never touches congregant balances", async () => {
    const t = await onboardTenant(admin, { name: "x", headGabbaiUserId: await user("g2") });
    const c = await makeCongregant(t.id);
    await asTenant(t.id, (tx) => createPledge(tx, t.id, gabbai(), { congregantId: c.id, amountAgorot: 500, pledgeDate: d("2026-09-01") }));
    process.env.FAKE_SAAS_CHARGE_FAIL = "true";
    await runSubscriptionCycle(t.id, new Date(Date.now() + 40 * DAY));
    process.env.FAKE_SAAS_CHARGE_FAIL = "";
    const payments = await asTenant(t.id, (tx) => tx.payment.count());
    expect(payments).toBe(0);
  });

  it("invalid transitions are refused; cancellation opens an export window", async () => {
    const t = await onboardTenant(admin, { name: "x", headGabbaiUserId: await user("g3") });
    await setSubscriptionStatus(admin, t.id, "cancelled");
    await expect(setSubscriptionStatus(admin, t.id, "active")).rejects.toMatchObject({ code: "invalid_transition" });
    const s = await withContext({ kind: "system", tenantId: t.id }, (tx) => tx.saaSSubscription.findUniqueOrThrow({ where: { tenantId: t.id } }));
    expect(s.accessEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("head gabbai replacement is atomic and audited; one active head gabbai only", async () => {
    const t = await onboardTenant(admin, { name: "x", headGabbaiUserId: await user("old") });
    await expect(replaceHeadGabbai(admin, t.id, await user("new"), " ")).rejects.toMatchObject({ code: "reason_required" });
    await replaceHeadGabbai(admin, t.id, "new", "הגבאי הקודם סיים תפקידו");
    const ms = await withContext({ kind: "platform_admin", userId: "admin-1" }, (tx) => tx.membership.findMany({ where: { tenantId: t.id, active: true } }));
    expect(ms.map((m) => m.userId)).toEqual(["new"]);
  });

  it("admin overview contains no congregant data", async () => {
    const t = await onboardTenant(admin, { name: "x", headGabbaiUserId: await user("g4") });
    await makeCongregant(t.id, { firstName: "סודי" });
    expect(JSON.stringify(await adminOverview("admin-1"))).not.toContain("סודי");
  });
});

describe("CSV import and export", () => {
  const csv = "id,first,last,phone,balance\n1,דוד,כהן,050-1234567,150\n2,רבקה,לוי,,\n";
  const map = { externalRef: 0, firstName: 1, lastName: 2, phone: 3, openingBalance: 4 };

  it("preview → commit → re-import refused; opening balance becomes a ledger entry", async () => {
    const t = await makeTenant();
    const p = await asTenant(t, (tx) => previewCongregantImport(tx, csv, map));
    expect(p.validCount).toBe(2);
    await asTenant(t, (tx) => commitCongregantImport(tx, t, gabbai(), csv, map));
    await expect(asTenant(t, (tx) => commitCongregantImport(tx, t, gabbai(), csv, map))).rejects.toMatchObject({ code: "already_imported" });
    const out = await asTenant(t, (tx) => exportBalancesCsv(tx));
    expect(out).toContain("דוד,כהן,050-1234567,150");
  });

  it("row errors are reported and nothing is written", async () => {
    const t = await makeTenant();
    const bad = "id,first,last,phone,balance\n1,,כהן,12,abc\n1,x,y,,\n";
    const p = await asTenant(t, (tx) => previewCongregantImport(tx, bad, map));
    expect(p.results[0]).toMatchObject({ ok: false, error: expect.stringContaining("חסר שם פרטי") });
    expect(p.results[1]).toMatchObject({ ok: false, error: expect.stringContaining("מזהה כפול") });
    await expect(asTenant(t, (tx) => commitCongregantImport(tx, t, gabbai(), bad, map))).rejects.toMatchObject({ code: "import_has_errors" });
    expect(await asTenant(t, (tx) => tx.congregant.count())).toBe(0);
  });

  it("export escapes formulas and only includes the tenant's own data", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await makeCongregant(a, { firstName: "=cmd()" });
    await makeCongregant(b, { firstName: "זר" });
    const out = await asTenant(a, (tx) => exportLedgerCsv(tx).then(async (l) => l + (await exportBalancesCsv(tx))));
    expect(out).toContain("'=cmd()");
    expect(out).not.toContain("זר");
  });
});
