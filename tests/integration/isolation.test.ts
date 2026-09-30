import { beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { asTenant, d, gabbai, makeCongregant, makeTenant, ownerQuery, truncateAll } from "./helpers";
import { createPledge } from "@/server/ledger/engine";
import { withContext, tenantCtx } from "@/server/db/context";
import { prisma } from "@/server/db/client";

let A: string, B: string, cardA: string, cardB: string, cardA2: string;
const PHONE = "+972500000001";

async function runtimeSql(sql: string, params: unknown[] = [], settings: Record<string, string> = {}) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    for (const [k, v] of Object.entries(settings)) await c.query("SELECT set_config($1, $2, true)", [k, v]);
    const r = await c.query(sql, params);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

beforeEach(async () => {
  await truncateAll();
  A = await makeTenant("בית כנסת א");
  B = await makeTenant("בית כנסת ב");
  cardA = (await makeCongregant(A, { phone: PHONE })).id;
  cardA2 = (await makeCongregant(A, { firstName: "שני" })).id;
  cardB = (await makeCongregant(B, { phone: PHONE })).id;
  await asTenant(A, (t) => createPledge(t, A, gabbai(), { congregantId: cardA, amountAgorot: 10000, pledgeDate: d("2026-09-01") }));
  await asTenant(A, (t) => createPledge(t, A, gabbai(), { congregantId: cardA2, amountAgorot: 7000, pledgeDate: d("2026-09-01") }));
  await asTenant(B, (t) => createPledge(t, B, gabbai(), { congregantId: cardB, amountAgorot: 20000, pledgeDate: d("2026-09-01") }));
});

describe("runtime database role", () => {
  it("is not superuser, not owner and has no BYPASSRLS", async () => {
    const r = await runtimeSql("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const owners = await ownerQuery<{ n: string }>(
      "SELECT count(*)::text n FROM pg_tables WHERE schemaname='public' AND tableowner = 'synagogue_app'",
    );
    expect(owners[0]!.n).toBe("0");
  });
});

describe("tenant isolation via SQL with the runtime role", () => {
  it("without context sees nothing", async () => {
    for (const t of ["Congregant", "Pledge", "Payment", "Allocation", "PersonalLink", "Task", "OutboundMessage"]) {
      const r = await runtimeSql(`SELECT count(*)::int n FROM "${t}"`);
      expect(r.rows[0].n, t).toBe(0);
    }
  });

  it("tenant A context sees only A rows even when asking for B ids", async () => {
    const r = await runtimeSql(`SELECT id FROM "Congregant"`, [], { "app.tenant_id": A });
    expect(r.rows.map((x) => x.id).sort()).toEqual([cardA, cardA2].sort());
    const byId = await runtimeSql(`SELECT id FROM "Congregant" WHERE id = $1`, [cardB], { "app.tenant_id": A });
    expect(byId.rowCount).toBe(0);
  });

  it("cannot update or insert rows of another tenant", async () => {
    const upd = await runtimeSql(`UPDATE "Congregant" SET notes = 'x' WHERE id = $1`, [cardB], { "app.tenant_id": A });
    expect(upd.rowCount).toBe(0);
    await expect(
      runtimeSql(
        `INSERT INTO "Pledge" (id, "tenantId", "congregantId", "amountAgorot", "pledgeDate", "createdBy") VALUES (gen_random_uuid(), $1, $2, 100, now(), 'x')`,
        [B, cardB],
        { "app.tenant_id": A },
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot attach a pledge of tenant A to a card of tenant B even with B context (composite FK)", async () => {
    await expect(
      runtimeSql(
        `INSERT INTO "Pledge" (id, "tenantId", "congregantId", "amountAgorot", "pledgeDate", "createdBy") VALUES (gen_random_uuid(), $1, $2, 100, now(), 'x')`,
        [B, cardA],
        { "app.tenant_id": B },
      ),
    ).rejects.toThrow();
  });

  it("allocation across cards is rejected by the database", async () => {
    // A payment of card A2 cannot be allocated to a pledge of card A.
    const [pledgeA] = (await runtimeSql(`SELECT id FROM "Pledge" WHERE "congregantId" = $1`, [cardA], { "app.tenant_id": A })).rows;
    const pay = await runtimeSql(
      `INSERT INTO "Payment" (id,"tenantId","congregantId",method,status,"amountAgorot","reportedBy") VALUES (gen_random_uuid(),$1,$2,'cash','confirmed',100,'gabbai') RETURNING id`,
      [A, cardA2],
      { "app.tenant_id": A },
    );
    await expect(
      runtimeSql(
        `INSERT INTO "Allocation" (id,"tenantId","paymentId","pledgeId","congregantId","amountAgorot",reason,"createdBy") VALUES (gen_random_uuid(),$1,$2,$3,$4,100,'payment','x')`,
        [A, pay.rows[0].id, pledgeA.id, cardA],
        { "app.tenant_id": A },
      ),
    ).rejects.toThrow();
  });

  it("portal context limits to the authorised card within the tenant", async () => {
    const r = await runtimeSql(`SELECT "congregantId" FROM "Pledge"`, [], { "app.tenant_id": A, "app.portal_congregants": cardA });
    expect(r.rows.map((x) => x.congregantId)).toEqual([cardA]);
    const other = await runtimeSql(`SELECT id FROM "Congregant" WHERE id = $1`, [cardA2], { "app.tenant_id": A, "app.portal_congregants": cardA });
    expect(other.rowCount).toBe(0);
  });

  it("same phone in two synagogues → separate cards per tenant", async () => {
    const a = await runtimeSql(`SELECT id FROM "Congregant" WHERE phone = $1`, [PHONE], { "app.tenant_id": A });
    const b = await runtimeSql(`SELECT id FROM "Congregant" WHERE phone = $1`, [PHONE], { "app.tenant_id": B });
    expect(a.rows.map((x) => x.id)).toEqual([cardA]);
    expect(b.rows.map((x) => x.id)).toEqual([cardB]);
  });

  it("platform admin context sees tenants but no congregant data", async () => {
    const t = await runtimeSql(`SELECT count(*)::int n FROM "Tenant"`, [], { "app.platform_admin": "on" });
    expect(t.rows[0].n).toBe(2);
    const c = await runtimeSql(`SELECT count(*)::int n FROM "Congregant"`, [], { "app.platform_admin": "on" });
    expect(c.rows[0].n).toBe(0);
    const p = await runtimeSql(`SELECT count(*)::int n FROM "Pledge"`, [], { "app.platform_admin": "on" });
    expect(p.rows[0].n).toBe(0);
  });

  it("invalid context values are rejected by the application layer", async () => {
    await expect(withContext(tenantCtx("not-a-uuid", gabbai()), async () => 1)).rejects.toThrow(/invalid tenant/);
  });
});

describe("concurrency and pool hygiene", () => {
  it("parallel requests for different tenants never see each other's rows", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const t = i % 2 ? A : B;
        return withContext(tenantCtx(t, gabbai()), async (tx) => ({ t, ids: (await tx.congregant.findMany()).map((c) => c.id) }));
      }),
    );
    for (const r of results) {
      if (r.t === A) expect(r.ids.sort()).toEqual([cardA, cardA2].sort());
      else expect(r.ids).toEqual([cardB]);
    }
    // After all that, a query outside any context still sees nothing.
    expect(await prisma.congregant.count()).toBe(0);
  });
});
