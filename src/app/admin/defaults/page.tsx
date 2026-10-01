import { requireAdmin } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { platformDefaults } from "@/server/admin/defaults";
import { Card, LinkButton } from "@/components/ui";
import { BehaviourForm, ReminderPolicyForm } from "@/components/gabbai/policy-forms";
import { saveReminderDefaultsAction, saveSettingsDefaultsAction } from "../actions";
import { LoginSettingsForm } from "../forms";
import { availableChannels, loginSettingsTx } from "@/server/auth/login-settings";

export default async function AdminDefaults() {
  const a = await requireAdmin();
  const [d, login] = await withContext({ kind: "platform_admin", userId: a.userId }, async (tx) => [await platformDefaults(tx), await loginSettingsTx(tx)] as const);
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-4">
      <LinkButton href="/admin" variant="secondary">חזרה</LinkButton>
      <h1 className="text-2xl font-bold">הגדרות מערכת</h1>
      <Card title="כניסת מתפללים">
        <LoginSettingsForm initial={login} channels={availableChannels()} envChannel={process.env.OTP_CHANNEL ?? "fake"} />
      </Card>
      <h2 className="text-xl font-bold">ברירות מחדל לבתי כנסת חדשים</h2>
      <p className="text-sm text-slate-600">הערכים כאן מוחלים על כל בית כנסת שמצטרף מעכשיו. הגבאי של כל בית כנסת יכול לשנות אותם אצלו. בתי כנסת קיימים לא משתנים.</p>
      <Card title="תזכורות">
        <ReminderPolicyForm initial={d.reminders} synagogueName="בית הכנסת" save={saveReminderDefaultsAction} />
      </Card>
      <Card title="התנהגות המערכת">
        <BehaviourForm initial={d.settings} save={saveSettingsDefaultsAction} />
      </Card>
    </main>
  );
}
