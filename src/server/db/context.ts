import { prisma, type Tx } from "./client";

// Every business query runs inside a transaction whose tenant context is set with
// set_config(..., is_local = true). The setting disappears at COMMIT/ROLLBACK, so a pooled
// connection can never carry the previous caller's tenant. Without a context, RLS returns no rows.

export type DbContext =
  | { kind: "tenant"; tenantId: string; userId?: string; actor: Actor }
  | { kind: "portal"; tenantId: string; congregantIds: string[]; actor: Actor }
  | { kind: "user"; userId: string }
  | { kind: "platform_admin"; userId: string }
  | { kind: "system"; tenantId?: string };

export type Actor = { type: "gabbai" | "congregant" | "system" | "platform_admin" | "provider"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(v: string, what: string) {
  if (!UUID.test(v)) throw new Error(`invalid ${what}`);
}

async function apply(tx: Tx, ctx: DbContext) {
  const set = (k: string, v: string) => tx.$executeRaw`SELECT set_config(${k}, ${v}, true)`;
  switch (ctx.kind) {
    case "tenant":
      assertUuid(ctx.tenantId, "tenant");
      await set("app.tenant_id", ctx.tenantId);
      if (ctx.userId) await set("app.user_id", ctx.userId);
      break;
    case "portal":
      assertUuid(ctx.tenantId, "tenant");
      if (ctx.congregantIds.length === 0) throw new Error("portal context without authorised cards");
      ctx.congregantIds.forEach((c) => assertUuid(c, "congregant"));
      await set("app.tenant_id", ctx.tenantId);
      await set("app.portal_congregants", ctx.congregantIds.join(","));
      break;
    case "user":
      await set("app.user_id", ctx.userId);
      break;
    case "platform_admin":
      await set("app.user_id", ctx.userId);
      await set("app.platform_admin", "on");
      break;
    case "system":
      await set("app.system", "on");
      if (ctx.tenantId) {
        assertUuid(ctx.tenantId, "tenant");
        await set("app.tenant_id", ctx.tenantId);
      }
      break;
  }
}

export type TxOptions = { isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable"; timeout?: number };

export async function withContext<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await apply(tx, ctx);
      return fn(tx);
    },
    { isolationLevel: opts.isolationLevel ?? "ReadCommitted", timeout: opts.timeout ?? 15_000, maxWait: 10_000 },
  );
}

export const tenantCtx = (tenantId: string, actor: Actor, userId?: string): DbContext => ({
  kind: "tenant",
  tenantId,
  actor,
  userId,
});
export const systemCtx = (tenantId?: string): DbContext => ({ kind: "system", tenantId });
export const actorOf = (ctx: DbContext): Actor =>
  ctx.kind === "tenant" || ctx.kind === "portal"
    ? ctx.actor
    : ctx.kind === "system"
      ? { type: "system", id: "system" }
      : { type: ctx.kind === "platform_admin" ? "platform_admin" : "gabbai", id: ctx.userId };
