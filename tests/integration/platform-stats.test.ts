import { beforeEach, describe, expect, it } from "vitest";
import { asTenant, d, gabbai, makeCongregant, makeTenant, truncateAll } from "./helpers";
import { createPledge } from "@/server/ledger/engine";
import { withContext } from "@/server/db/context";
import { adminDashboard, attentionItems, tenantSummaries } from "@/server/admin/dashboard";

let A: string;
beforeEach(async () => {
  await truncateAll();
  A = await makeTenant("אוהל יעקב");
  await makeTenant("היכל שלמה");
  const c = await makeCongregant(A, { firstName: "משה", phone: "+972533334444" });
  await asTenant(A, (tx) => createPledge(tx, A, gabbai(), { congregantId: c.id, amountAgorot: 18000, pledgeDate: d("2026-09-01") }));
});

describe("platform owner dashboard (aggregates only)", () => {
  it("counts per synagogue and per month in the admin context", async () => {
    const ts = await tenantSummaries("admin");
    const a = ts.find((t) => t.id === A)!;
    expect(a).toMatchObject({ name: "אוהל יעקב", congregants: 1, pledges: 1, payments: 0 });
    expect(a.firstPledgeAt).toBeInstanceOf(Date);
    const dash = await adminDashboard("admin");
    expect(dash.kpi.tenants).toBe(2);
    expect(dash.funnel.map((f) => f.value)).toEqual([2, 0, 1, 0]);
    expect(dash.months).toHaveLength(12);
    expect(dash.months.at(-1)!.newTenants).toBe(2);
    // nothing in the dashboard carries a congregant field
    expect(JSON.stringify(dash)).not.toContain("משה");
    expect(JSON.stringify(dash)).not.toContain("+97253");
  });

  it("the count functions return nothing outside the platform-admin context", async () => {
    const asGabbai = await asTenant(A, (tx) => tx.$queryRaw<unknown[]>`SELECT * FROM platform_tenant_stats()`);
    const asSystem = await withContext({ kind: "system" }, (tx) => tx.$queryRaw<unknown[]>`SELECT * FROM platform_monthly(12)`);
    const activity = await withContext({ kind: "user", userId: "x" }, (tx) => tx.$queryRaw<unknown[]>`SELECT * FROM platform_admin_activity(10)`);
    expect([asGabbai.length, asSystem.length, activity.length]).toEqual([0, 0, 0]);
  });

  it("attention list ranks billing problems first and names ending trials", () => {
    const base = { id: "t", name: "בית", city: null, createdAt: new Date(), gabbai: null, gabbaiSignedIn: true, congregants: 0, pledges: 0, payments: 0, firstPledgeAt: null, firstPaymentAt: null, lastActivityAt: null, messages30d: 0, integrations: [], integrationError: false, openCases: 0, health: null, needsAttention: false };
    const sub = (status: string, trialEndsAt: Date | null = null) => ({ status, trialEndsAt }) as never;
    const items = attentionItems(
      [
        { ...base, id: "a", name: "ניסיון", subscription: sub("trial", new Date(Date.now() + 3 * 86400_000)) },
        { ...base, id: "b", name: "חוב", subscription: sub("past_due") },
      ],
      [],
    );
    expect(items.map((i) => i.kind)).toEqual(["billing", "trial_ending"]);
    expect(items[1]!.text).toMatch(/3 ימים/);
  });
});
