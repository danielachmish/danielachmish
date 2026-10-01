import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { BadgeCheck, Bell, Building2, Download, LifeBuoy, MessageCircle, Settings2, SlidersHorizontal, Wallet } from "lucide-react";
import { Badge, Card, LinkButton, PageHeader, fmtDate } from "@/components/ui";
import { GeneralSettings, SupportGrantForm } from "@/components/gabbai/settings-forms";
import { IntegrationPanel } from "@/components/integration-panel";
import { integrationStatus } from "@/server/integrations/connect";
import { providersFor } from "@/server/integrations/catalog";
import { modeFor } from "@/server/env";
import { embeddedSignupConfig } from "@/server/integrations/whatsapp-signup";
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
  const modes = { payment: modeFor("payment"), messaging: modeFor("messaging") };
  return (
    <>
      <PageHeader title="הגדרות" icon={Settings2} subtitle="כל מה שקורה במערכת – אתם מחליטים אם, מתי ואיך." />
      <nav aria-label="קיצורים" className="sticky top-14 z-10 -mx-4 flex gap-2 overflow-x-auto bg-[#f6f4ef]/90 px-4 py-2 text-sm backdrop-blur lg:top-0">
        {[["#general", "פרטים"], ["#reminders", "תזכורות"], ["#behaviour", "התנהגות המערכת"], ["#integrations", "חיבורים"], ["#export", "ייצוא"], ["#support", "תמיכה"]].map(([h, l]) => (
          <a key={h} href={h} className="shrink-0 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 font-medium text-slate-700 shadow-sm hover:border-brand-300 hover:text-brand-700">{l}</a>
        ))}
      </nav>
      <div id="general" className="scroll-mt-28" />
      <Card title="פרטי בית הכנסת" icon={Building2}>
        <GeneralSettings name={d.tenant.name} />
      </Card>
      <div id="reminders" className="scroll-mt-28">
        <Card title="תזכורות – מתי ואיך" icon={Bell}>
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
        <Card title="התנהגות המערכת" icon={SlidersHorizontal}>
          <BehaviourForm initial={parseSettings(d.tenant.settings)} />
        </Card>
      </div>
      <div id="integrations" className="scroll-mt-28 space-y-4">
      {(["payment", "messaging"] as const).map((k) => (
        <Card key={k} title={k === "payment" ? "חיבור סליקה (החשבון של בית הכנסת)" : "חיבור וואטסאפ רשמי"} icon={k === "payment" ? Wallet : MessageCircle}>
          <IntegrationPanel kind={k} providers={providersFor(k, modes[k])} current={d.integrations[k]} target={{ type: "gabbai" }} embeddedSignup={k === "messaging" ? embeddedSignupConfig() : null} />
        </Card>
      ))}
      </div>
      <Card title="מנוי" icon={BadgeCheck}>
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
      <div id="export" className="scroll-mt-28" />
      <Card title="ייצוא נתונים" icon={Download} description="הנתונים שלכם – תמיד אפשר להוריד אותם.">
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="secondary" href="/api/export/balances" prefetch={false}><Download className="size-4" aria-hidden /> יתרות מתפללים (CSV)</LinkButton>
          <LinkButton variant="secondary" href="/api/export/ledger" prefetch={false}><Download className="size-4" aria-hidden /> כל התנועות וההקצאות (CSV)</LinkButton>
        </div>
      </Card>
      <div id="support" className="scroll-mt-28" />
      <Card title="גישת תמיכה זמנית" icon={LifeBuoy}>
        <p className="mb-2 text-sm text-slate-600">צוות השירות אינו רואה נתוני מתפללים. אפשר לתת גישה מוגבלת בזמן ובהיקף; כל צפייה מתועדת.</p>
        <SupportGrantForm grants={d.grants.map((x) => ({ id: x.id, scope: x.scope, reason: x.reason, expiresAt: x.expiresAt.toISOString() }))} />
      </Card>
    </>
  );
}
