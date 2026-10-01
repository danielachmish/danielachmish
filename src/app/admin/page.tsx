import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { adminOverview } from "@/server/admin/tenants";
import { Activity, Building2, ChevronLeft, FileText, LifeBuoy, MessageSquare, PlusCircle, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Alert, Badge, Card, Empty, Money, PageHeader, Stat, fmtDate } from "@/components/ui";
import { emailConfigured } from "@/server/providers/email";
import { OnboardForm, SubscriptionControls, ManualPaymentForm, ResolveCase } from "./forms";

const SUB: Record<string, string> = { trial: "ניסיון", active: "פעיל", past_due: "ממתין לתשלום", grace: "חסד", suspended: "מושעה", cancelled: "מבוטל" };

export default async function Admin() {
  const a = await requireAdmin();
  const o = await adminOverview(a.userId);
  return (
    <>
      <PageHeader
        title="ניהול השירות"
        icon={ShieldCheck}
        subtitle="מסך זה אינו מציג נתוני מתפללים. גישה לנתוני בית כנסת מתאפשרת רק בהרשאה זמנית של הגבאי."
        actions={
          <Link href="/admin/defaults" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium shadow-sm hover:bg-slate-50">
            <SlidersHorizontal className="size-4" aria-hidden /> הגדרות מערכת: כניסה וברירות מחדל
          </Link>
        }
      />
      {!emailConfigured() && (
        <Alert tone="warn">
          שליחת דוא״ל עוד לא הוגדרה (RESEND_API_KEY ו-EMAIL_FROM). עד אז אי אפשר להוסיף גבאים – הם מקבלים את קישור הסיסמה בדוא״ל.
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="בתי כנסת" value={<span className="num">{o.tenants.length}</span>} icon={Building2} />
        <Stat label="מנויים פעילים" value={<span className="num">{o.tenants.filter((t) => t.subscription?.status === "active").length}</span>} icon={ShieldCheck} tone="green" />
        <Stat label="דורשים תשומת לב" value={<span className="num">{o.health.filter((h) => h.pendingEvents > 0 || h.openExceptionTasks > 0 || h.unknownMessages > 0).length}</span>} icon={Activity} tone="amber" />
        <Stat label="תקלות פתוחות" value={<span className="num">{o.cases.length}</span>} icon={LifeBuoy} tone="red" />
      </div>
      <Card title="תקינות המערכת" icon={Activity} description="ספירות בלבד – ללא שמות, טלפונים או סכומים.">
        {o.health.length === 0 ? <Empty>אין בתי כנסת.</Empty> : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table-clean">
              <thead>
                <tr><th>בית כנסת</th><th>אירועים ממתינים</th><th>חריגי סליקה (30 יום)</th><th>תשלומים פתוחים מעל שעה</th><th>הודעות לא ידועות / נכשלו (7 ימים)</th><th>משימות חריג פתוחות</th></tr>
              </thead>
              <tbody>
                {o.health.map((h) => {
                  const bad = h.pendingEvents > 0 || h.openExceptionTasks > 0 || h.unknownMessages > 0;
                  return (
                    <tr key={h.tenantId}>
                      <td className="font-medium">{o.tenants.find((t) => t.id === h.tenantId)?.name} {bad ? <Badge tone="amber" dot>דורש תשומת לב</Badge> : <Badge tone="green" dot>תקין</Badge>}</td>
                      <td className="num">{h.pendingEvents}</td>
                      <td className="num">{h.exceptionEvents}</td>
                      <td className="num">{h.staleAttempts}</td>
                      <td className="num">{h.unknownMessages} / {h.failedMessages}</td>
                      <td className="num">{h.openExceptionTasks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">״אירועים ממתינים״ מעל 0 לאורך זמן מעיד שעבודות הרקע לא רצות.</p>
      </Card>
      <Card title="בתי כנסת" icon={Building2} description={`${o.tenants.length} בתי כנסת במערכת`}>
        {o.tenants.length === 0 ? <Empty>אין בתי כנסת.</Empty> : (
          <ul className="space-y-3">
            {o.tenants.map((t) => {
              const ints = o.integrations.filter((i) => i.tenantId === t.id && i.status !== "replaced");
              return (
                <li key={t.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link className="group flex min-w-0 items-center gap-3" href={`/admin/tenants/${t.id}`}>
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Building2 className="size-5" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900 group-hover:text-brand-700 group-hover:underline">{t.name}</span>
                        <span className="block text-xs text-slate-500">{t.city ?? ""}{t.city ? " · " : ""}גבאי: <span dir="ltr">{t.memberships[0]?.user.email ?? "—"}</span></span>
                      </span>
                      <ChevronLeft className="size-4 text-slate-300" aria-hidden />
                    </Link>
                    <Badge tone={t.subscription?.status === "active" ? "green" : t.subscription?.status === "suspended" ? "red" : "amber"} dot>{SUB[t.subscription?.status ?? ""] ?? "ללא מנוי"}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge><MessageSquare className="size-3" aria-hidden /> הודעות <span className="num">{t.subscription?.messagesUsed ?? 0}/{o.quota}</span></Badge>
                    {ints.map((i) => <Badge key={i.id} tone={i.status === "active" ? "blue" : "red"}>{i.kind === "payment" ? "סליקה" : "וואטסאפ"} {i.provider}/{i.environment}{i.lastError ? " – תקלה" : ""}</Badge>)}
                  </div>
                  {t.subscription && <div className="mt-3"><SubscriptionControls tenantId={t.id} status={t.subscription.status} /></div>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title="חשבוניות מנוי פתוחות" icon={FileText}>
        {o.invoices.length === 0 ? <Empty>אין.</Empty> : (
          <ul className="space-y-2">
            {o.invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 text-sm">
                {o.tenants.find((t) => t.id === inv.tenantId)?.name} · {fmtDate(inv.periodStart)}–{fmtDate(inv.periodEnd)} · <Money agorot={inv.amountAgorot} />
                <ManualPaymentForm tenantId={inv.tenantId} invoiceId={inv.id} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">גביית מנוי אוטומטית אמיתית טרם חוברה (החלטה פתוחה). בסביבת פיתוח פועל ספק דמה; אחרת נרשם תשלום ידני מתועד.</p>
      </Card>
      <Card title="תקלות ומשימות תמיכה" icon={LifeBuoy}>
        {o.cases.length === 0 ? <Empty>אין תקלות פתוחות.</Empty> : (
          <ul className="space-y-2 text-sm">
            {o.cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="amber">{c.kind}</Badge> {o.tenants.find((t) => t.id === c.tenantId)?.name} · {c.summary} · {fmtDate(c.createdAt)}
                <ResolveCase id={c.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="הצטרפות בית כנסת חדש" icon={PlusCircle} description="נוצר חשבון לגבאי הראשי ונשלח לו קישור לבחירת סיסמה.">
        <OnboardForm />
      </Card>
    </>
  );
}
