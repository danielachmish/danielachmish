import pg from "pg";
import { randomUUID } from "node:crypto";
import { withContext, tenantCtx, type Actor } from "@/server/db/context";

// Owner connection is used ONLY to wipe data between tests. All assertions go through the runtime role.
export async function truncateAll() {
  const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await c.connect();
  const { rows } = await c.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  await c.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
  await c.end();
}

export async function ownerQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await c.connect();
  try {
    return (await c.query<T>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

export const gabbai = (id = "gabbai-1"): Actor => ({ type: "gabbai", id });

export async function makeTenant(name = "בית כנסת בדיקה") {
  const id = randomUUID();
  await withContext({ kind: "platform_admin", userId: "admin" }, (tx) => tx.tenant.create({ data: { id, name } }));
  return id;
}

export async function makeCongregant(tenantId: string, data: { firstName?: string; lastName?: string; phone?: string | null } = {}) {
  return withContext(tenantCtx(tenantId, gabbai()), (tx) =>
    tx.congregant.create({
      data: { tenantId, firstName: data.firstName ?? "ישראל", lastName: data.lastName ?? "ישראלי", phone: data.phone ?? null },
    }),
  );
}

export const asTenant = <T>(tenantId: string, fn: Parameters<typeof withContext<T>>[1]) =>
  withContext(tenantCtx(tenantId, gabbai()), fn);

export const d = (s: string) => new Date(`${s}T00:00:00Z`);

import { encryptJson } from "@/server/crypto";

export async function makeFakePaymentIntegration(tenantId: string, externalAccountId = `acct-${randomUUID().slice(0, 8)}`) {
  return withContext(tenantCtx(tenantId, gabbai()), (tx) =>
    tx.integrationAccount.create({
      data: {
        tenantId,
        kind: "payment",
        provider: "fake",
        environment: "fake",
        externalAccountId,
        encryptedSecrets: encryptJson({ webhookSecret: `whsec-${externalAccountId}` }),
      },
    }),
  );
}

export async function makeSubscription(tenantId: string, status = "active") {
  return withContext({ kind: "platform_admin", userId: "admin" }, (tx) =>
    tx.saaSSubscription.upsert({ where: { tenantId }, create: { tenantId, status }, update: { status } }),
  );
}

export async function setTenant(tenantId: string, data: Record<string, unknown>) {
  return withContext(tenantCtx(tenantId, gabbai()), (tx) => tx.tenant.update({ where: { id: tenantId }, data }));
}
