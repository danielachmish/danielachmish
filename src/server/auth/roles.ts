import { withContext } from "../db/context";
import { gabbaiSession } from "./session";

// What the signed-in user may do. One user can hold several roles (e.g. a gabbai who also has pledges).
export type Role = { kind: "admin"; href: "/admin"; label: string } | { kind: "gabbai"; href: "/dashboard"; label: string } | { kind: "congregant"; href: string; label: string; tenantId: string };

/** Synagogues where this user has an active congregant account (tenant names read per synagogue). */
export async function congregantTenants(userId: string) {
  const links = await withContext({ kind: "user", userId }, (tx) =>
    tx.congregantAccount.findMany({ where: { userId, revokedAt: null }, select: { tenantId: true, congregantId: true }, orderBy: { createdAt: "asc" } }),
  );
  const tenantIds = [...new Set(links.map((l) => l.tenantId))];
  return Promise.all(
    tenantIds.map(async (tenantId) => {
      const t = await withContext({ kind: "system", tenantId }, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }));
      return { tenantId, name: t.name, congregantIds: links.filter((l) => l.tenantId === tenantId).map((l) => l.congregantId) };
    }),
  );
}

export async function rolesFor(user: { id: string; emailVerified: boolean; platformRole?: string | null }): Promise<Role[]> {
  if (!user.emailVerified) return [];
  const roles: Role[] = [];
  if (user.platformRole === "admin") roles.push({ kind: "admin", href: "/admin", label: "עמדת ניהול המערכת" });
  const g = await gabbaiSession();
  if (g) roles.push({ kind: "gabbai", href: "/dashboard", label: `גבאי – ${g.tenantName}` });
  for (const t of await congregantTenants(user.id)) roles.push({ kind: "congregant", href: `/me?t=${t.tenantId}`, label: `החובות שלי – ${t.name}`, tenantId: t.tenantId });
  return roles;
}
