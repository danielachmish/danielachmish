import Link from "next/link";
import { History } from "lucide-react";
import { requireAdmin } from "@/server/auth/session";
import { adminActivity } from "@/server/admin/dashboard";
import { Card, Empty, PageHeader, fmtDateTime } from "@/components/ui";
import { ADMIN_ACTION } from "@/components/admin/labels";

export default async function AdminActivity() {
  const a = await requireAdmin();
  const rows = await adminActivity(a.userId);
  return (
    <>
      <PageHeader title="יומן פעולות" icon={History} subtitle="פעולות של צוות השירות והצטרפות בתי כנסת. היומן אינו ניתן לעריכה או למחיקה." />
      <Card>
        {rows.length === 0 ? (
          <Empty icon={History}>אין פעולות עדיין.</Empty>
        ) : (
          <ol className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl px-2 py-2 hover:bg-slate-50">
                <span className="font-medium">{ADMIN_ACTION[r.action] ?? r.action}</span>
                {r.tenantId && r.tenantName && <Link className="text-brand-700 hover:underline" href={`/admin/tenants/${r.tenantId}`}>{r.tenantName}</Link>}
                {r.actor && <span className="text-slate-500">{r.actor}</span>}
                <span className="ms-auto text-xs text-slate-400">{fmtDateTime(r.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
