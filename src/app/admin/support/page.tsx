import Link from "next/link";
import { KeyRound, LifeBuoy } from "lucide-react";
import { requireAdmin } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { Badge, Card, Empty, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";
import { ResolveCase } from "../forms";

const SCOPE: Record<string, string> = { read_ledger: "צפייה בנתונים", read_integrations: "חיבורים בלבד" };

export default async function AdminSupport() {
  const a = await requireAdmin();
  const { cases, tenants } = await withContext({ kind: "platform_admin", userId: a.userId }, async (tx) => ({
    cases: await tx.supportCase.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 200 }),
    tenants: await tx.tenant.findMany({ select: { id: true, name: true } }),
  }));
  const names = new Map(tenants.map((t) => [t.id, t.name]));
  // Temporary access the head gabbaim gave this admin (each read in that synagogue's own context).
  const grants = (
    await Promise.all(
      tenants.map((t) =>
        withContext({ kind: "tenant", tenantId: t.id, userId: a.userId, actor: a.actor }, (tx) =>
          tx.supportGrant.findMany({ where: { granteeUserId: a.userId, revokedAt: null, expiresAt: { gt: new Date() } } }),
        ),
      ),
    )
  ).flat();
  return (
    <>
      <PageHeader title="תמיכה ותקלות" icon={LifeBuoy} subtitle="תקלות פתוחות והרשאות גישה זמניות שגבאים נתנו לך." />
      <Card title="תקלות פתוחות" icon={LifeBuoy} description={cases.length ? `${cases.length} פתוחות` : undefined}>
        {cases.length === 0 ? (
          <Empty icon={LifeBuoy}>אין תקלות פתוחות.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
                <Badge tone="amber">{c.kind}</Badge>
                {c.tenantId ? <Link className="font-medium text-brand-700 hover:underline" href={`/admin/tenants/${c.tenantId}`}>{names.get(c.tenantId) ?? "—"}</Link> : <span className="font-medium">כללי</span>}
                <span className="flex-1">{c.summary}</span>
                <span className="text-xs text-slate-400">{fmtDate(c.createdAt)}</span>
                <ResolveCase id={c.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="הרשאות גישה פעילות" icon={KeyRound} description="נותנות גישה מוגבלת בזמן; כל צפייה מתועדת ביומן של בית הכנסת.">
        {grants.length === 0 ? (
          <Empty icon={KeyRound}>אין הרשאות פעילות. גבאי נותן הרשאה ממסך ההגדרות שלו.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {grants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
                <Link className="font-medium text-brand-700 hover:underline" href={`/admin/tenants/${g.tenantId}?tab=support`}>{names.get(g.tenantId) ?? "—"}</Link>
                <Badge tone="blue">{SCOPE[g.scope] ?? g.scope}</Badge>
                <span className="flex-1 text-slate-600">{g.reason}</span>
                <span className="text-xs text-slate-500">עד {fmtDateTime(g.expiresAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
