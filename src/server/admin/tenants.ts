import { withContext, type Actor } from "../db/context";
import { planConfig } from "../config";
import { audit } from "../audit";
import { DomainError } from "../errors";

/** Onboarding: creates the synagogue, its trial subscription and links the head gabbai user. */
export async function onboardTenant(admin: Actor, input: { name: string; city?: string; headGabbaiUserId: string }) {
  if (!input.name.trim()) throw new DomainError("name_required", "יש להזין שם בית כנסת.");
  const cfg = planConfig();
  return withContext({ kind: "platform_admin", userId: admin.id }, async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: input.name.trim(), city: input.city?.trim() || null } });
    await tx.saaSSubscription.create({ data: { tenantId: tenant.id, status: "trial", trialEndsAt: new Date(Date.now() + cfg.trialDays * 86400_000) } });
    await tx.membership.create({ data: { tenantId: tenant.id, userId: input.headGabbaiUserId, role: "head_gabbai" } });
    await audit(tx, tenant.id, admin, "tenant.onboard", { type: "Tenant", id: tenant.id });
    return tenant;
  });
}

/** Documented head-gabbai replacement: ends the current membership and creates the new one atomically. */
export async function replaceHeadGabbai(admin: Actor, tenantId: string, newUserId: string, reason: string) {
  if (!reason.trim()) throw new DomainError("reason_required", "יש לתעד סיבה להחלפת הגבאי.");
  return withContext({ kind: "platform_admin", userId: admin.id }, async (tx) => {
    const current = await tx.membership.findFirst({ where: { tenantId, active: true, role: "head_gabbai" } });
    if (current?.userId === newUserId) return current;
    if (current) await tx.membership.update({ where: { id: current.id }, data: { active: false, endedAt: new Date() } });
    const existing = await tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: newUserId } } });
    const m = existing
      ? await tx.membership.update({ where: { id: existing.id }, data: { active: true, endedAt: null, role: "head_gabbai" } })
      : await tx.membership.create({ data: { tenantId, userId: newUserId, role: "head_gabbai" } });
    await tx.auditLog.createMany({
      data: {
        tenantId,
        actorType: admin.type,
        actorId: admin.id,
        action: "tenant.replace_head_gabbai",
        entityType: "Membership",
        entityId: m.id,
        data: { previousUserId: current?.userId ?? null, reason },
      },
    });
    return m;
  });
}

/** Admin overview: tenants, subscription, integration health and open support cases. No congregant data. */
export async function adminOverview(adminId: string) {
  return withContext({ kind: "platform_admin", userId: adminId }, async (tx) => {
    const tenants = await tx.tenant.findMany({
      include: { subscription: true, memberships: { where: { active: true }, include: { user: { select: { email: true, name: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    const integrations = await tx.integrationAccount.findMany({
      select: { id: true, tenantId: true, kind: true, provider: true, environment: true, status: true, lastError: true, lastErrorAt: true, displayName: true },
    });
    const cases = await tx.supportCase.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 100 });
    const invoices = await tx.saaSInvoice.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } });
    return { tenants, integrations, cases, invoices, quota: planConfig().monthlyMessageQuota };
  });
}
