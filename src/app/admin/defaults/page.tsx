import { requireAdmin } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { platformDefaults } from "@/server/admin/defaults";
import { Card, LinkButton } from "@/components/ui";
import { BehaviourForm, ReminderPolicyForm } from "@/components/gabbai/policy-forms";
import { saveReminderDefaultsAction, saveSettingsDefaultsAction } from "../actions";

export default async function AdminDefaults() {
  const a = await requireAdmin();
  const d = await withContext({ kind: "platform_admin", userId: a.userId }, (tx) => platformDefaults(tx));
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-4">
      <LinkButton href="/admin" variant="secondary">חזרה</LinkButton>
      <h1 className="text-2xl font-bold">ברירות מחדל לבתי כנסת חדשים</h1>
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
