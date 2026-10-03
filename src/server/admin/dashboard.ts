import { prisma } from "../db/client";
import { withContext } from "../db/context";
import { planConfig } from "../config";

// Platform owner's view of the service. Aggregates and dates only – never congregant data (names, phones,
// amounts). Everything per synagogue comes from SECURITY DEFINER count functions that return nothing outside
// the platform-admin context.

type StatRow = {
  tenant_id: string;
  congregants: bigint;
  pledges: bigint;
  confirmed_payments: bigint;
  first_pledge_at: Date | null;
  first_payment_at: Date | null;
  last_activity_at: Date | null;
  messages_30d: bigint;
};
type HealthRow = {
  tenant_id: string;
  pending_events: bigint;
  exception_events: bigint;
  stale_attempts: bigint;
  unknown_messages: bigint;
  failed_messages: bigint;
  open_exception_tasks: bigint;
  last_event_at: Date | null;
};

export type TenantSummary = Awaited<ReturnType<typeof tenantSummaries>>[number];

/** Every synagogue with subscription, head gabbai, sign-in state, usage counts and health. */
export async function tenantSummaries(adminId: string) {
  const data = await withContext({ kind: "platform_admin", userId: adminId }, async (tx) => ({
    tenants: await tx.tenant.findMany({
      include: { subscription: true, memberships: { where: { active: true }, include: { user: { select: { id: true, email: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    stats: await tx.$queryRaw<StatRow[]>`SELECT * FROM platform_tenant_stats()`,
    health: await tx.$queryRaw<HealthRow[]>`SELECT * FROM platform_health()`,
    integrations: await tx.integrationAccount.findMany({
      where: { status: { not: "replaced" } },
      select: { id: true, tenantId: true, kind: true, provider: true, environment: true, status: true, lastError: true, lastErrorAt: true },
    }),
    cases: await tx.supportCase.findMany({ where: { status: "open" }, select: { id: true, tenantId: true } }),
  }));
  // Has the head gabbai ever signed in? (sessions belong to the auth tables, outside tenant data)
  const gabbaiIds = data.tenants.flatMap((t) => t.memberships.map((m) => m.userId));
  const signedIn = new Set(
    (await prisma.session.groupBy({ by: ["userId"], where: { userId: { in: gabbaiIds } } })).map((s) => s.userId),
  );
  const stat = new Map(data.stats.map((s) => [s.tenant_id, s]));
  const health = new Map(data.health.map((h) => [h.tenant_id, h]));
  return data.tenants.map((t) => {
    const s = stat.get(t.id);
    const h = health.get(t.id);
    const gabbai = t.memberships[0]?.user ?? null;
    const ints = data.integrations.filter((i) => i.tenantId === t.id);
    const healthIssues = h ? Number(h.pending_events) + Number(h.open_exception_tasks) + Number(h.unknown_messages) : 0;
    return {
      id: t.id,
      name: t.name,
      city: t.city,
      createdAt: t.createdAt,
      subscription: t.subscription,
      gabbai,
      gabbaiSignedIn: gabbai ? signedIn.has(gabbai.id) : false,
      congregants: Number(s?.congregants ?? 0),
      pledges: Number(s?.pledges ?? 0),
      payments: Number(s?.confirmed_payments ?? 0),
      firstPledgeAt: s?.first_pledge_at ?? null,
      firstPaymentAt: s?.first_payment_at ?? null,
      lastActivityAt: s?.last_activity_at ?? null,
      messages30d: Number(s?.messages_30d ?? 0),
      integrations: ints,
      integrationError: ints.some((i) => i.status === "error" || !!i.lastError),
      openCases: data.cases.filter((c) => c.tenantId === t.id).length,
      health: h
        ? {
            pendingEvents: Number(h.pending_events),
            exceptionEvents: Number(h.exception_events),
            staleAttempts: Number(h.stale_attempts),
            unknownMessages: Number(h.unknown_messages),
            failedMessages: Number(h.failed_messages),
            openExceptionTasks: Number(h.open_exception_tasks),
            lastEventAt: h.last_event_at,
          }
        : null,
      needsAttention: healthIssues > 0,
    };
  });
}

export type Attention = { tenantId: string | null; tenantName: string; kind: "trial_ending" | "billing" | "integration" | "gabbai_not_signed_in" | "health" | "case"; text: string };

/** Everything the owner should look at today, most urgent first. */
export function attentionItems(tenants: TenantSummary[], openCases: { tenantId: string | null; summary: string }[]): Attention[] {
  const now = Date.now();
  const out: Attention[] = [];
  for (const t of tenants) {
    const sub = t.subscription;
    if (sub && ["past_due", "grace", "suspended"].includes(sub.status))
      out.push({ tenantId: t.id, tenantName: t.name, kind: "billing", text: sub.status === "suspended" ? "המנוי מושעה" : "המנוי ממתין לתשלום" });
    if (sub?.status === "trial" && sub.trialEndsAt && sub.trialEndsAt.getTime() - now < 7 * 86400_000)
      out.push({ tenantId: t.id, tenantName: t.name, kind: "trial_ending", text: sub.trialEndsAt.getTime() < now ? "תקופת הניסיון הסתיימה" : `הניסיון מסתיים בעוד ${Math.max(1, Math.ceil((sub.trialEndsAt.getTime() - now) / 86400_000))} ימים` });
    if (t.integrationError) out.push({ tenantId: t.id, tenantName: t.name, kind: "integration", text: "תקלה בחיבור סליקה או וואטסאפ" });
    if (t.gabbai && !t.gabbaiSignedIn && now - t.createdAt.getTime() > 2 * 86400_000)
      out.push({ tenantId: t.id, tenantName: t.name, kind: "gabbai_not_signed_in", text: "הגבאי עוד לא נכנס למערכת" });
    if (t.needsAttention) out.push({ tenantId: t.id, tenantName: t.name, kind: "health", text: "אירועים ממתינים או חריגים פתוחים" });
  }
  const names = new Map(tenants.map((t) => [t.id, t.name]));
  for (const c of openCases) out.push({ tenantId: c.tenantId, tenantName: (c.tenantId && names.get(c.tenantId)) || "כללי", kind: "case", text: c.summary });
  const rank: Record<Attention["kind"], number> = { billing: 0, integration: 1, health: 2, case: 3, trial_ending: 4, gabbai_not_signed_in: 5 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** Dashboard: KPIs, onboarding funnel, monthly series, attention list and recent admin activity. */
export async function adminDashboard(adminId: string) {
  const tenants = await tenantSummaries(adminId);
  const { months, cases, activity } = await withContext({ kind: "platform_admin", userId: adminId }, async (tx) => {
    const months = await tx.$queryRaw<{ month: string; new_tenants: bigint; confirmed_payments: bigint; messages: bigint }[]>`SELECT * FROM platform_monthly(12)`;
    const cases = await tx.supportCase.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, select: { tenantId: true, summary: true } });
    const activity = await tx.$queryRaw<{ id: string; tenant_id: string | null; actor_id: string | null; action: string; created_at: Date }[]>`SELECT * FROM platform_admin_activity(12)`;
    return { months, cases, activity };
  });
  const actorIds = [...new Set(activity.map((a) => a.actor_id).filter((x): x is string => !!x))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const names = new Map(tenants.map((t) => [t.id, t.name]));
  const plan = planConfig();
  const active = tenants.filter((t) => t.subscription?.status === "active").length;
  const trial = tenants.filter((t) => t.subscription?.status === "trial").length;
  const attention = attentionItems(tenants, cases);
  return {
    kpi: {
      tenants: tenants.length,
      active,
      trial,
      mrrAgorot: active * plan.priceAgorot,
      priceAgorot: plan.priceAgorot,
      attention: attention.length,
      congregants: tenants.reduce((s, t) => s + t.congregants, 0),
      messages30d: tenants.reduce((s, t) => s + t.messages30d, 0),
      quota: plan.monthlyMessageQuota,
    },
    funnel: [
      { key: "added", label: "נוספו למערכת", value: tenants.length },
      { key: "signed_in", label: "הגבאי נכנס", value: tenants.filter((t) => t.gabbaiSignedIn).length },
      { key: "first_pledge", label: "נרשם נדר ראשון", value: tenants.filter((t) => t.firstPledgeAt).length },
      { key: "first_payment", label: "התקבל תשלום ראשון", value: tenants.filter((t) => t.firstPaymentAt).length },
    ],
    months: months.map((m) => ({ month: m.month, newTenants: Number(m.new_tenants), payments: Number(m.confirmed_payments), messages: Number(m.messages) })),
    attention,
    activity: activity.map((a) => ({ id: a.id, action: a.action, at: a.created_at, tenantName: a.tenant_id ? names.get(a.tenant_id) ?? null : null, tenantId: a.tenant_id, actor: a.actor_id ? actors.get(a.actor_id) ?? null : null })),
    newest: tenants.slice(0, 5),
  };
}

/** The platform admin's own actions, across synagogues. */
export async function adminActivity(adminId: string, limit = 200) {
  const rows = await withContext({ kind: "platform_admin", userId: adminId }, (tx) =>
    tx.$queryRaw<{ id: string; tenant_id: string | null; actor_id: string | null; action: string; created_at: Date }[]>`SELECT * FROM platform_admin_activity(${limit})`,
  );
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter((x): x is string => !!x))];
  const tenants = await withContext({ kind: "platform_admin", userId: adminId }, (tx) => tx.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }));
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const names = new Map(tenants.map((t) => [t.id, t.name]));
  return rows.map((r) => ({ id: r.id, action: r.action, at: r.created_at, tenantId: r.tenant_id, tenantName: r.tenant_id ? names.get(r.tenant_id) ?? null : null, actor: r.actor_id ? actors.get(r.actor_id) ?? null : null }));
}
