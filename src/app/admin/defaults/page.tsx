import { requireAdmin } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { platformDefaults } from "@/server/admin/defaults";
import { Bell, LogIn, SlidersHorizontal } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { BehaviourForm, ReminderPolicyForm } from "@/components/gabbai/policy-forms";
import { saveReminderDefaultsAction, saveSettingsDefaultsAction } from "../actions";
import { LoginSettingsForm } from "../forms";
import { availableChannels, loginSettingsTx } from "@/server/auth/login-settings";

export default async function AdminDefaults() {
  const a = await requireAdmin();
  const [d, login] = await withContext({ kind: "platform_admin", userId: a.userId }, async (tx) => [await platformDefaults(tx), await loginSettingsTx(tx)] as const);
  return (
    <>
      <PageHeader title="הגדרות מערכת" icon={SlidersHorizontal} subtitle="הגדרות שחלות על כל השירות, וברירות מחדל לבתי כנסת חדשים." />
      <Card title="כניסת מתפללים" icon={LogIn}>
        <LoginSettingsForm initial={login} channels={availableChannels()} envChannel={process.env.OTP_CHANNEL ?? "fake"} />
      </Card>
      <div className="pt-2">
        <h2 className="text-xl font-bold">ברירות מחדל לבתי כנסת חדשים</h2>
        <p className="mt-1 text-sm text-slate-600">הערכים כאן מוחלים על כל בית כנסת שמצטרף מעכשיו. הגבאי של כל בית כנסת יכול לשנות אותם אצלו. בתי כנסת קיימים לא משתנים.</p>
      </div>
      <Card title="תזכורות" icon={Bell}>
        <ReminderPolicyForm initial={d.reminders} synagogueName="בית הכנסת" save={saveReminderDefaultsAction} />
      </Card>
      <Card title="התנהגות המערכת" icon={SlidersHorizontal}>
        <BehaviourForm initial={d.settings} save={saveSettingsDefaultsAction} />
      </Card>
    </>
  );
}
