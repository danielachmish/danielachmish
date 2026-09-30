import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { Badge, Card, LinkButton, fmtDate } from "@/components/ui";
import { GeneralSettings, SupportGrantForm } from "@/components/gabbai/settings-forms";
import { IntegrationPanel } from "@/components/integration-panel";
import { integrationStatus } from "@/server/integrations/connect";
import { providersFor } from "@/server/integrations/catalog";
import { BehaviourForm, ReminderPolicyForm } from "@/components/gabbai/policy-forms";
import { parseSettings } from "@/server/settings";

const SUB: Record<string, string> = { trial: "ניסיון", active: "פעיל", past_due: "ממתין לתשלום", grace: "תקופת חסד", suspended: "מושעה", cancelled: "מבוטל" };

export default async function Settings() {
  const g = await requireGabbai();
  const d = await withContext(g.ctx, async (tx) => ({
    tenant: await tx.tenant.findUniqueOrThrow({ where: { id: g.tenantId } }),
    integrations: await integrationStatus(tx),
    sub: await tx.saaSSubscription.findUnique({ where: { tenantId: g.tenantId } }),
    grants: await tx.supportGrant.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
  }));
  const mode = process.env.PROVIDER_MODE ?? "fake";
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
      {(["payment", "messaging"] as const).map((k) => (
        <Card key={k} title={k === "payment" ? "חיבור סליקה (החשבון של בית הכנסת)" : "חיבור וואטסאפ רשמי"}>
          <IntegrationPanel kind={k} providers={providersFor(k, mode)} current={d.integrations[k]} target={{ type: "gabbai" }} />
        </Card>
      ))}
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
