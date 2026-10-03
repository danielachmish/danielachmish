import Link from "next/link";
import { AlertTriangle, ArrowLeft, Building2, CircleDollarSign, CreditCard, FlaskConical, History, MessageSquare, PlusCircle, Users } from "lucide-react";
import { requireAdmin } from "@/server/auth/session";
import { adminDashboard } from "@/server/admin/dashboard";
import { emailConfigured } from "@/server/providers/email";
import { Alert, Badge, Card, ColumnChart, Empty, LinkButton, Money, PageHeader, Stat, fmtDate, fmtDateTime } from "@/components/ui";
import { ADMIN_ACTION, SUB_LABEL, shortMonth, subTone } from "@/components/admin/labels";

const ATTENTION_TONE = { billing: "red", integration: "red", health: "amber", case: "amber", trial_ending: "blue", gabbai_not_signed_in: "slate" } as const;

// Platform owner's dashboard. Aggregates only – no congregant data (see server/admin/dashboard.ts).
export default async function AdminDashboard() {
  const a = await requireAdmin();
  const d = await adminDashboard(a.userId);
  const funnelMax = Math.max(1, d.funnel[0]!.value);
  return (
    <>
      <PageHeader
        title="לוח בקרה"
        subtitle="מבט על השירות כולו – ספירות וסכומים כוללים בלבד, בלי נתוני מתפללים."
        actions={
          <LinkButton href="/admin/onboard" size="sm">
            <PlusCircle className="size-4" aria-hidden /> בית כנסת חדש
          </LinkButton>
        }
      />
      {!emailConfigured() && <Alert tone="warn">שליחת דוא״ל עוד לא הוגדרה (RESEND_API_KEY ו-EMAIL_FROM). עד אז אי אפשר להוסיף גבאים.</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="בתי כנסת פעילים" value={<span className="num">{d.kpi.active}</span>} hint={<>מתוך <span className="num">{d.kpi.tenants}</span> במערכת</>} icon={Building2} tone="green" href="/admin/tenants?f=active" />
        <Stat label="בתקופת ניסיון" value={<span className="num">{d.kpi.trial}</span>} icon={FlaskConical} tone="brand" href="/admin/tenants?f=trial" />
        <Stat
          label="הכנסה חודשית צפויה"
          value={<Money agorot={d.kpi.mrrAgorot} />}
          hint={d.kpi.priceAgorot ? <>לפי <Money agorot={d.kpi.priceAgorot} /> לבית כנסת</> : "מחיר המנוי עוד לא נקבע"}
          icon={CircleDollarSign}
          tone="amber"
          href="/admin/billing"
        />
        <Stat label="דורש טיפול" value={<span className="num">{d.kpi.attention}</span>} icon={AlertTriangle} tone={d.kpi.attention ? "red" : "slate"} href="#attention" />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2" title="משפך הצטרפות" description="איפה כל בית כנסת נמצא בדרך לשימוש מלא" icon={Users}>
          <ol className="space-y-3">
            {d.funnel.map((f, i) => (
              <li key={f.key}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="num grid size-5 place-items-center rounded-full bg-slate-100 text-[11px] text-slate-500">{i + 1}</span>
                    {f.label}
                  </span>
                  <span className="num font-semibold">{f.value}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(f.value / funnelMax) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-slate-500">בית כנסת ש״נתקע״ בשלב מסוים – כדאי ליצור קשר עם הגבאי.</p>
        </Card>

        <Card className="lg:col-span-3" title="דורש טיפול עכשיו" icon={AlertTriangle}>
          <div id="attention" className="scroll-mt-24" />
          {d.attention.length === 0 ? (
            <Empty icon={AlertTriangle}>אין כרגע שום דבר שדורש טיפול.</Empty>
          ) : (
            <ul className="-mx-2 divide-y divide-slate-100">
              {d.attention.slice(0, 8).map((x, i) => (
                <li key={i}>
                  <Link href={x.tenantId ? `/admin/tenants/${x.tenantId}` : "/admin/support"} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50">
                    <Badge tone={ATTENTION_TONE[x.kind]} dot>{x.tenantName}</Badge>
                    <span className="flex-1 text-sm">{x.text}</span>
                    <ArrowLeft className="size-4 text-slate-300" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {d.attention.length > 8 && <p className="mt-2 text-xs text-slate-500">ועוד {d.attention.length - 8} פריטים.</p>}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="בתי כנסת חדשים" description="לפי חודש, 12 חודשים" icon={Building2}>
          <ColumnChart label="בתי כנסת חדשים" data={d.months.map((m) => ({ key: m.month, label: shortMonth(m.month), value: m.newTenants }))} />
        </Card>
        <Card title="תשלומים שהתקבלו" description="מספר העסקאות שאושרו בכל השירות" icon={CreditCard}>
          <ColumnChart label="תשלומים שאושרו" tone="green" data={d.months.map((m) => ({ key: m.month, label: shortMonth(m.month), value: m.payments }))} />
        </Card>
        <Card title="הודעות שנשלחו" description={`בכל השירות · מכסה של ${d.kpi.quota} לבית כנסת בחודש`} icon={MessageSquare}>
          <ColumnChart label="הודעות שנשלחו" tone="gold" data={d.months.map((m) => ({ key: m.month, label: shortMonth(m.month), value: m.messages }))} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="הצטרפו לאחרונה"
          icon={Building2}
          actions={
            <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              לכל בתי הכנסת <ArrowLeft className="size-4" aria-hidden />
            </Link>
          }
        >
          {d.newest.length === 0 ? (
            <Empty icon={Building2}>
              עדיין אין בתי כנסת. <Link className="font-medium text-brand-700 underline" href="/admin/onboard">להוספת הראשון</Link>
            </Empty>
          ) : (
            <ul className="-mx-2 divide-y divide-slate-100">
              {d.newest.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/tenants/${t.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50">
                    <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700"><Building2 className="size-4.5" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.name}</span>
                      <span className="block text-xs text-slate-500">
                        הצטרף {fmtDate(t.createdAt)} · <span className="num">{t.congregants}</span> מתפללים
                      </span>
                    </span>
                    <Badge tone={subTone(t.subscription?.status)} dot>{SUB_LABEL[t.subscription?.status ?? ""] ?? "ללא מנוי"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title="פעילות אחרונה"
          icon={History}
          actions={
            <Link href="/admin/activity" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              ליומן המלא <ArrowLeft className="size-4" aria-hidden />
            </Link>
          }
        >
          {d.activity.length === 0 ? (
            <Empty icon={History}>אין פעילות עדיין.</Empty>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {d.activity.map((x) => (
                <li key={x.id} className="flex items-start gap-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{ADMIN_ACTION[x.action] ?? x.action}</span>
                    {x.tenantName && <span className="text-slate-600"> · {x.tenantName}</span>}
                    <span className="block text-xs text-slate-400">
                      {fmtDateTime(x.at)}
                      {x.actor ? ` · ${x.actor}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="text-center text-xs text-slate-400">
        <span className="num">{d.kpi.congregants}</span> מתפללים בכל השירות · <span className="num">{d.kpi.messages30d}</span> הודעות ב-30 הימים האחרונים
      </p>
    </>
  );
}
