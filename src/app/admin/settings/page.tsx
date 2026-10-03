import { Bell, LogIn, SlidersHorizontal } from "lucide-react";
import { requireAdmin } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { platformDefaults } from "@/server/admin/defaults";
import { availableChannels, loginSettingsTx } from "@/server/auth/login-settings";
import { Card, PageHeader, Tabs } from "@/components/ui";
import { BehaviourForm, ReminderPolicyForm } from "@/components/gabbai/policy-forms";
import { saveReminderDefaultsAction, saveSettingsDefaultsAction } from "../actions";
import { LoginSettingsForm } from "../forms";

const TABS = [
  ["login", "כניסת מתפללים"],
  ["reminders", "ברירות מחדל לתזכורות"],
  ["behaviour", "ברירות מחדל להתנהגות"],
] as const;

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const a = await requireAdmin();
  const { tab: raw } = await searchParams;
  const tab = TABS.some(([k]) => k === raw) ? raw! : "login";
  const [d, login] = await withContext({ kind: "platform_admin", userId: a.userId }, async (tx) => [await platformDefaults(tx), await loginSettingsTx(tx)] as const);
  return (
    <>
      <PageHeader title="הגדרות מערכת" icon={SlidersHorizontal} subtitle="הגדרות שחלות על כל השירות, וברירות מחדל לבתי כנסת חדשים." />
      <Tabs active={`/admin/settings?tab=${tab}`} items={TABS.map(([k, label]) => ({ href: `/admin/settings?tab=${k}`, label }))} />
      {tab === "login" && (
        <Card title="כניסת מתפללים" icon={LogIn}>
          <LoginSettingsForm initial={login} channels={availableChannels()} envChannel={process.env.OTP_CHANNEL ?? "fake"} />
        </Card>
      )}
      {tab !== "login" && (
        <p className="text-sm text-slate-600">הערכים כאן מוחלים על כל בית כנסת שמצטרף מעכשיו. הגבאי של כל בית כנסת יכול לשנות אותם אצלו. בתי כנסת קיימים לא משתנים.</p>
      )}
      {tab === "reminders" && (
        <Card title="תזכורות" icon={Bell}>
          <ReminderPolicyForm initial={d.reminders} synagogueName="בית הכנסת" save={saveReminderDefaultsAction} />
        </Card>
      )}
      {tab === "behaviour" && (
        <Card title="התנהגות המערכת" icon={SlidersHorizontal}>
          <BehaviourForm initial={d.settings} save={saveSettingsDefaultsAction} />
        </Card>
      )}
    </>
  );
}
