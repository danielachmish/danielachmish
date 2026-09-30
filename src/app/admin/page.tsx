import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { adminOverview } from "@/server/admin/tenants";
import { Badge, Card, Empty, Money, fmtDate } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out";
import { OnboardForm, SubscriptionControls, ManualPaymentForm, ResolveCase } from "./forms";

const SUB: Record<string, string> = { trial: "ניסיון", active: "פעיל", past_due: "ממתין לתשלום", grace: "חסד", suspended: "מושעה", cancelled: "מבוטל" };

export default async function Admin() {
  const a = await requireAdmin();
  const o = await adminOverview(a.userId);
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ניהול השירות</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-slate-600">מסך זה אינו מציג נתוני מתפללים. גישה לנתוני בית כנסת מתאפשרת רק בהרשאה זמנית של הגבאי.</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/defaults" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100">ברירות מחדל לבתי כנסת חדשים</Link>
      </div>
      <Card title="תקינות המערכת">
        {o.health.length === 0 ? <Empty>אין בתי כנסת.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500">
                <tr className="text-right"><th className="p-2">בית כנסת</th><th className="p-2">אירועים ממתינים</th><th className="p-2">חריגי סליקה (30 יום)</th><th className="p-2">תשלומים פתוחים מעל שעה</th><th className="p-2">הודעות לא ידועות / נכשלו (7 ימים)</th><th className="p-2">משימות חריג פתוחות</th></tr>
              </thead>
              <tbody>
                {o.health.map((h) => {
                  const bad = h.pendingEvents > 0 || h.openExceptionTasks > 0 || h.unknownMessages > 0;
                  return (
                    <tr key={h.tenantId} className="border-t border-slate-100">
                      <td className="p-2">{o.tenants.find((t) => t.id === h.tenantId)?.name} {bad ? <Badge tone="amber">דורש תשומת לב</Badge> : <Badge tone="green">תקין</Badge>}</td>
                      <td className="p-2 num">{h.pendingEvents}</td>
                      <td className="p-2 num">{h.exceptionEvents}</td>
                      <td className="p-2 num">{h.staleAttempts}</td>
                      <td className="p-2 num">{h.unknownMessages} / {h.failedMessages}</td>
                      <td className="p-2 num">{h.openExceptionTasks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">ספירות בלבד – ללא שמות, טלפונים או סכומים. ״אירועים ממתינים״ מעל 0 לאורך זמן מעיד שעבודות הרקע לא רצות.</p>
      </Card>
      <Card title={`בתי כנסת (${o.tenants.length})`}>
        {o.tenants.length === 0 ? <Empty>אין בתי כנסת.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {o.tenants.map((t) => {
              const ints = o.integrations.filter((i) => i.tenantId === t.id && i.status !== "replaced");
              return (
                <li key={t.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-semibold text-brand-700 hover:underline" href={`/admin/tenants/${t.id}`}>{t.name}</Link>
                    {t.city && <span className="text-sm text-slate-500">{t.city}</span>}
                    <Badge tone={t.subscription?.status === "active" ? "green" : t.subscription?.status === "suspended" ? "red" : "amber"}>{SUB[t.subscription?.status ?? ""] ?? "ללא מנוי"}</Badge>
                    <span className="text-sm">גבאי: {t.memberships[0]?.user.email ?? "—"}</span>
                    <span className="text-sm">הודעות: <span className="num">{t.subscription?.messagesUsed ?? 0}/{o.quota}</span></span>
                    {ints.map((i) => <Badge key={i.id} tone={i.status === "active" ? "blue" : "red"}>{i.kind === "payment" ? "סליקה" : "וואטסאפ"} {i.provider}/{i.environment}{i.lastError ? " – תקלה" : ""}</Badge>)}
                  </div>
                  {t.subscription && <SubscriptionControls tenantId={t.id} status={t.subscription.status} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title="חשבוניות מנוי פתוחות">
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
      <Card title="תקלות ומשימות תמיכה">
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
      <Card title="הצטרפות בית כנסת חדש">
        <OnboardForm />
      </Card>
    </main>
  );
}
