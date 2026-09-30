import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { Badge, Card, LinkButton, fmtDate } from "@/components/ui";
import { GeneralSettings, IntegrationForm, SupportGrantForm } from "@/components/gabbai/settings-forms";
import { BehaviourForm, ReminderPolicyForm } from "@/components/gabbai/policy-forms";
import { parseSettings } from "@/server/settings";

const SUB: Record<string, string> = { trial: "ניסיון", active: "פעיל", past_due: "ממתין לתשלום", grace: "תקופת חסד", suspended: "מושעה", cancelled: "מבוטל" };

export default async function Settings() {
  const g = await requireGabbai();
  const d = await withContext(g.ctx, async (tx) => ({
    tenant: await tx.tenant.findUniqueOrThrow({ where: { id: g.tenantId } }),
    integrations: await tx.integrationAccount.findMany({ orderBy: { createdAt: "desc" } }),
    sub: await tx.saaSSubscription.findUnique({ where: { tenantId: g.tenantId } }),
    grants: await tx.supportGrant.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
  }));
  const mode = process.env.PROVIDER_MODE ?? "fake";
  const active = (k: string) => d.integrations.find((i) => i.kind === k && (i.status === "active" || i.status === "error"));
  return (
    <>
      <h1 className="text-2xl font-bold">הגדרות</h1>
      <nav aria-label="קיצורים" className="flex flex-wrap gap-2 text-sm">
        {[["#reminders", "תזכורות"], ["#behaviour", "התנהגות המערכת"], ["#integrations", "חיבורים"], ["#export", "ייצוא"], ["#support", "תמיכה"]].map(([h, l]) => (
          <a key={h} href={h} className="rounded-full border border-slate-300 bg-white px-3 py-1 hover:bg-slate-100">{l}</a>
        ))}
      </nav>
      <Card title="פרטי בית הכנסת">
        <GeneralSettings name={d.tenant.name} />
      </Card>
      <div id="reminders" className="scroll-mt-28">
        <Card title="תזכורות – מתי ואיך">
          <ReminderPolicyForm
            synagogueName={d.tenant.name}
            initial={{
              enabled: d.tenant.remindersEnabled,
              firstDelayDays: d.tenant.reminderFirstDelayDays,
              intervalDays: d.tenant.reminderIntervalDays,
              days: d.tenant.reminderDays,
              hour: d.tenant.reminderHour,
              minute: d.tenant.reminderMinute,
              skipHolidays: d.tenant.reminderSkipHolidays,
              template: d.tenant.reminderTemplate,
            }}
          />
        </Card>
      </div>
      <div id="behaviour" className="scroll-mt-28">
        <Card title="התנהגות המערכת">
          <BehaviourForm initial={parseSettings(d.tenant.settings)} />
        </Card>
      </div>
      <div id="integrations" className="scroll-mt-28 space-y-4">
      {(["payment", "messaging"] as const).map((k) => {
        const a = active(k);
        return (
          <Card key={k} title={k === "payment" ? "חיבור סליקה (החשבון של בית הכנסת)" : "חיבור וואטסאפ רשמי"}>
            {a ? (
              <p className="mb-3 text-sm">
                מחובר: <span className="num">{a.displayName ?? a.externalAccountId}</span> · {a.provider} · סביבה {a.environment}{" "}
                <Badge tone={a.status === "active" ? "green" : "red"}>{a.status === "active" ? "תקין" : "תקלה"}</Badge>
                {a.lastError && <span className="block text-red-700">תקלה אחרונה: {a.lastError}</span>}
              </p>
            ) : (
              <p className="mb-3 text-sm text-slate-600">לא מחובר.</p>
            )}
            <IntegrationForm kind={k} mode={mode} hasActive={!!a} />
          </Card>
        );
      })}
      </div>
      <Card title="מנוי">
        {d.sub ? (
          <p className="text-sm">
            מצב: <Badge>{SUB[d.sub.status] ?? d.sub.status}</Badge>
            {d.sub.trialEndsAt && d.sub.status === "trial" && <> · הניסיון מסתיים {fmtDate(d.sub.trialEndsAt)}</>}
            {d.sub.currentPeriodEnd && <> · תקופה נוכחית עד {fmtDate(d.sub.currentPeriodEnd)}</>}
          </p>
        ) : (
          <p className="text-sm">אין מנוי רשום.</p>
        )}
      </Card>
      <Card title="ייצוא נתונים" className="scroll-mt-28" >
        <span id="export" />
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="secondary" href="/api/export/balances" prefetch={false}>יתרות מתפללים (CSV)</LinkButton>
          <LinkButton variant="secondary" href="/api/export/ledger" prefetch={false}>כל התנועות וההקצאות (CSV)</LinkButton>
        </div>
      </Card>
      <Card title="גישת תמיכה זמנית">
        <span id="support" />
        <p className="mb-2 text-sm text-slate-600">צוות השירות אינו רואה נתוני מתפללים. אפשר לתת גישה מוגבלת בזמן ובהיקף; כל צפייה מתועדת.</p>
        <SupportGrantForm grants={d.grants.map((x) => ({ id: x.id, scope: x.scope, reason: x.reason, expiresAt: x.expiresAt.toISOString() }))} />
      </Card>
    </>
  );
}
