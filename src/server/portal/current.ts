import { cookies } from "next/headers";
import { withContext } from "../db/context";
import { currentUser } from "../auth/session";
import { congregantTenants } from "../auth/roles";
import { portalIdentity, type PortalIdentity } from "./links";
import { PORTAL_COOKIE, PORTAL_TENANT_COOKIE } from "./cookie";

/**
 * The congregant viewing /me: either a phone-verified portal session (personal link / phone login) or a
 * signed-in app account linked to cards by a gabbai invitation. Both resolve to the same card set and RLS
 * portal context, so every congregant screen and action works the same way.
 */
export type PortalWant = { tenantId?: string; congregantId?: string };

export async function currentPortal(want: PortalWant = {}): Promise<PortalIdentity | null> {
  const jar = await cookies();
  const viaPhone = await portalIdentity(jar.get(PORTAL_COOKIE)?.value);
  if (viaPhone) return viaPhone;
  const user = await currentUser();
  if (!user?.emailVerified) return null;
  return accountPortalIdentity(user.id, { tenantId: want.tenantId ?? jar.get(PORTAL_TENANT_COOKIE)?.value, congregantId: want.congregantId });
}

/**
 * Identity of a signed-in account in one synagogue: the one holding the requested card (actions name the
 * card they act on), else the requested synagogue, else the first one.
 */
export async function accountPortalIdentity(userId: string, want: PortalWant = {}): Promise<PortalIdentity | null> {
  const tenants = await congregantTenants(userId);
  const ordered = [
    ...tenants.filter((x) => x.tenantId === want.tenantId),
    ...tenants.filter((x) => x.tenantId !== want.tenantId),
  ];
  if (want.congregantId) {
    for (const t of ordered) {
      const p = await identityIn(userId, t);
      if (p?.congregantIds.includes(want.congregantId)) return p;
    }
  }
  return ordered[0] ? identityIn(userId, ordered[0]) : null;
}

async function identityIn(userId: string, t: { tenantId: string; congregantIds: string[] }): Promise<PortalIdentity | null> {
  return withContext({ kind: "system", tenantId: t.tenantId }, async (tx) => {
    const cards = await tx.congregant.findMany({ where: { id: { in: t.congregantIds } }, select: { id: true, phone: true } });
    if (cards.length === 0) return null;
    const primary = cards.find((c) => c.id === t.congregantIds[0]) ?? cards[0]!;
    // Family permissions granted to the phone of a linked card apply to the account too (same as phone login).
    const phones = cards.map((c) => c.phone).filter((p): p is string => !!p);
    const perms = phones.length ? await tx.contactPermission.findMany({ where: { phone: { in: phones }, revokedAt: null } }) : [];
    const ids = [...new Set([primary.id, ...cards.map((c) => c.id), ...perms.map((p) => p.congregantId)])];
    return { tenantId: t.tenantId, congregantIds: ids, primaryCongregantId: primary.id, phone: primary.phone ?? "", sessionId: `account:${userId}`, via: "account" as const, userId };
  });
}

/** Other synagogues the viewer can switch to (names are shown only after sign-in / a verified code). */
export async function switchableSynagogues(p: PortalIdentity) {
  if (p.via !== "account") return null;
  return (await congregantTenants(p.userId!)).filter((t) => t.tenantId !== p.tenantId).map((t) => ({ tenantId: t.tenantId, name: t.name }));
}
