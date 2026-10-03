import { Bell } from "lucide-react";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { Card } from "@/components/ui";
import { ReminderPolicyForm } from "@/components/gabbai/policy-forms";

export default async function SettingsReminders() {
  const g = await requireGabbai();
  const t = await withContext(g.ctx, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: g.tenantId } }));
  return (
    <Card title="תזכורות – מתי ואיך" icon={Bell}>
      <ReminderPolicyForm
        synagogueName={t.name}
        initial={{
          enabled: t.remindersEnabled,
          firstDelayDays: t.reminderFirstDelayDays,
          intervalDays: t.reminderIntervalDays,
          days: t.reminderDays,
          hour: t.reminderHour,
          minute: t.reminderMinute,
          skipHolidays: t.reminderSkipHolidays,
          template: t.reminderTemplate,
        }}
      />
    </Card>
  );
}
