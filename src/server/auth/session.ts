import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { withContext, type Actor, type DbContext } from "../db/context";

export type GabbaiSession = {
  userId: string;
  name: string;
  email: string;
  tenantId: string;
  tenantName: string;
  actor: Actor;
  ctx: DbContext & { tenantId: string };
};

export async function currentUser() {
  const s = await auth.api.getSession({ headers: await headers() });
  return s?.user ?? null;
}

/**
 * Tenant is derived ONLY from the authenticated session's active membership – never from a URL,
 * form field or header supplied by the browser.
 */
export async function gabbaiSession(): Promise<GabbaiSession | null> {
  const user = await currentUser();
  if (!user || !user.emailVerified) return null;
  const m = await withContext({ kind: "user", userId: user.id }, (tx) =>
    tx.membership.findFirst({ where: { userId: user.id, active: true, role: "head_gabbai" }, include: { tenant: true } }),
  );
  if (!m) return null;
  const actor: Actor = { type: "gabbai", id: user.id };
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    tenantId: m.tenantId,
    tenantName: m.tenant.name,
    actor,
    ctx: { kind: "tenant", tenantId: m.tenantId, userId: user.id, actor },
  };
}

export async function requireGabbai(): Promise<GabbaiSession> {
  const s = await gabbaiSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdmin() {
  const user = await currentUser();
  if (!user || !user.emailVerified || (user as { platformRole?: string }).platformRole !== "admin") redirect("/login");
  return { userId: user.id, actor: { type: "platform_admin" as const, id: user.id } };
}
