import { beforeEach, describe, expect, it } from "vitest";
import { asTenant, gabbai, makeCongregant, makeTenant, truncateAll } from "./helpers";
import { commitPledgeImport, previewPledgeImport, reconcileFromReport } from "@/server/gabbai/import-export";
import { cardSummary } from "@/server/ledger/balance";
import { recordVerifiedCardPayment } from "@/server/ledger/engine";

let tenantId: string;
beforeEach(async () => {
  await truncateAll();
  tenantId = await makeTenant();
});

describe("pledge import", () => {
  const map = { match: 0, amount: 1, date: 2, category: 3 };

  it("matches by external id or phone, never by name; commit once; re-import refused", async () => {
    const a = await asTenant(tenantId, (tx) => tx.congregant.create({ data: { tenantId, firstName: "א", lastName: "כהן", externalRef: "A1" } }));
    const b = await makeCongregant(tenantId, { firstName: "ב", lastName: "לוי", phone: "+972521112233" });
    const csv = "who,amount,date,type\nA1,180,2026-09-01,עלייה\n052-1112233,36.50,01/09/2026,\n";
    const p = await asTenant(tenantId, (tx) => previewPledgeImport(tx, csv, map));
    expect(p.validCount).toBe(2);
    await asTenant(tenantId, (tx) => commitPledgeImport(tx, tenantId, gabbai(), csv, map));
    expect((await asTenant(tenantId, (tx) => cardSummary(tx, a.id))).debtAgorot).toBe(18000);
    expect((await asTenant(tenantId, (tx) => cardSummary(tx, b.id))).debtAgorot).toBe(3650);
    await expect(asTenant(tenantId, (tx) => commitPledgeImport(tx, tenantId, gabbai(), csv, map))).rejects.toMatchObject({ code: "already_imported" });
  });

  it("names, unknown ids, ambiguous phones and bad values are row errors", async () => {
    await makeCongregant(tenantId, { firstName: "דוד", lastName: "כהן", phone: "+972500000009" });
    await makeCongregant(tenantId, { firstName: "שרה", lastName: "כהן", phone: "+972500000009" });
    const csv = "who,amount,date\nדוד כהן,10,2026-09-01\nZZZ,10,2026-09-01\n0500000009,10,2026-09-01\n0500000009,abc,31/31/2026\n";
    const p = await asTenant(tenantId, (tx) => previewPledgeImport(tx, csv, { match: 0, amount: 1, date: 2 }));
    expect(p.validCount).toBe(0);
    expect(p.results[2]!.error).toContain("יותר מכרטיס");
    expect(p.results[3]!.error).toMatch(/סכום.*תאריך/);
  });
});

describe("reconciliation from a provider report", () => {
  it("finds missing charges, wrong amounts and missing refunds without touching balances", async () => {
    const c = await makeCongregant(tenantId);
    const acc = await asTenant(tenantId, (tx) =>
      tx.integrationAccount.create({ data: { tenantId, kind: "payment", provider: "fake", environment: "fake", externalAccountId: "rc" } }),
    );
    await asTenant(tenantId, (tx) =>
      recordVerifiedCardPayment(tx, tenantId, { type: "provider", id: "x" }, {
        congregantId: c.id, amountAgorot: 10000, currency: "ILS", integrationAccountId: acc.id,
        identity: { provider: "fake", environment: "fake", accountId: "rc", transactionId: "T-OK" },
      }),
    );
    const csv = "id,amount,type,status\nT-OK,100,charge,approved\nT-MISSING,50,charge,approved\nT-FAILED,70,charge,declined\nR-1,-20,refund,approved\n";
    const before = await asTenant(tenantId, (tx) => cardSummary(tx, c.id));
    const r = await asTenant(tenantId, (tx) => reconcileFromReport(tx, tenantId, gabbai(), csv, { transactionId: 0, amount: 1, type: 2, status: 3 }));
    expect(r.diffs.map((d) => d.transactionId).sort()).toEqual(["R-1", "T-MISSING"]);
    expect(await asTenant(tenantId, (tx) => cardSummary(tx, c.id))).toEqual(before);
    expect(await asTenant(tenantId, (tx) => tx.task.count({ where: { kind: "reconciliation" } }))).toBe(1);
  });
});
