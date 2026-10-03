import Link from "next/link";
import { Activity } from "lucide-react";
import { requireAdmin } from "@/server/auth/session";
import { tenantSummaries } from "@/server/admin/dashboard";
import { Badge, Card, Empty, PageHeader, fmtDateTime } from "@/components/ui";

export default async function AdminHealth() {
  const a = await requireAdmin();
  const tenants = await tenantSummaries(a.userId);
  return (
    <>
      <PageHeader title="תקינות המערכת" icon={Activity} subtitle="ספירות בלבד – ללא שמות, טלפונים או סכומים." />
      <Card title="לפי בית כנסת" icon={Activity}>
        {tenants.length === 0 ? (
          <Empty>אין בתי כנסת.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table-clean">
              <thead>
                <tr><th>בית כנסת</th><th>מצב</th><th>אירועים ממתינים</th><th>חריגי סליקה (30 יום)</th><th>תשלומים פתוחים מעל שעה</th><th>הודעות לא ידועות / נכשלו (7 ימים)</th><th>משימות חריג</th><th>אירוע אחרון</th></tr>
              </thead>
              <tbody>
                {tenants.map((t) => {
                  const h = t.health;
                  return (
                    <tr key={t.id}>
                      <td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/tenants/${t.id}`}>{t.name}</Link></td>
                      <td>{t.needsAttention || t.integrationError ? <Badge tone="amber" dot>דורש תשומת לב</Badge> : <Badge tone="green" dot>תקין</Badge>}</td>
                      <td className="num">{h?.pendingEvents ?? 0}</td>
                      <td className="num">{h?.exceptionEvents ?? 0}</td>
                      <td className="num">{h?.staleAttempts ?? 0}</td>
                      <td className="num">{h?.unknownMessages ?? 0} / {h?.failedMessages ?? 0}</td>
                      <td className="num">{h?.openExceptionTasks ?? 0}</td>
                      <td className="text-slate-500">{h?.lastEventAt ? fmtDateTime(h.lastEventAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">״אירועים ממתינים״ מעל 0 לאורך זמן מעיד שעבודות הרקע לא רצות. ״לא ידועות״ – הודעות שמצב המסירה שלהן לא ברור; הן לא נשלחות שוב אוטומטית.</p>
      </Card>
    </>
  );
}
