import { z } from "zod";
import type { Tx } from "../db/client";
import { tenantSettingsSchema, parseSettings, type TenantSettings } from "../settings";
import { validateTemplate } from "../reminders/template";
import { DomainError } from "../errors";

// Defaults the platform owner sets once; applied to every newly onboarded synagogue.
// Each synagogue's gabbai can change his own values afterwards.
export const reminderDefaultsSchema = z.object({
  enabled: z.boolean(),
  firstDelayDays: z.number().int().min(0).max(365),
  intervalDays: z.number().int().min(1).max(365),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  skipHolidays: z.boolean(),
  template: z.string().max(700).nullable(),
});
export type ReminderDefaults = z.infer<typeof reminderDefaultsSchema>;

export const BUILTIN_REMINDER_DEFAULTS: ReminderDefaults = {
  enabled: true,
  firstDelayDays: 7,
  intervalDays: 30,
  days: [0, 1, 2, 3, 4],
  hour: 10,
  minute: 0,
  skipHolidays: true,
  template: null,
};

export async function platformDefaults(tx: Tx): Promise<{ reminders: ReminderDefaults; settings: TenantSettings }> {
  const rows = await tx.platformSetting.findMany({ where: { key: { in: ["tenant_defaults.reminders", "tenant_defaults.settings"] } } });
  const rem = reminderDefaultsSchema.safeParse(rows.find((r) => r.key === "tenant_defaults.reminders")?.value);
  return {
    reminders: rem.success ? rem.data : BUILTIN_REMINDER_DEFAULTS,
    settings: parseSettings(rows.find((r) => r.key === "tenant_defaults.settings")?.value),
  };
}

export async function saveReminderDefaults(tx: Tx, by: string, input: ReminderDefaults) {
  const p = reminderDefaultsSchema.parse(input);
  if (p.enabled && p.days.length === 0) throw new DomainError("no_days", "יש לבחור לפחות יום אחד לשליחה.");
  if (p.template?.trim()) {
    const err = validateTemplate(p.template);
    if (err) throw new DomainError("bad_template", err);
  }
  const value = { ...p, template: p.template?.trim() || null };
  await tx.platformSetting.upsert({ where: { key: "tenant_defaults.reminders" }, create: { key: "tenant_defaults.reminders", value, updatedBy: by }, update: { value, updatedBy: by } });
}

export async function saveSettingsDefaults(tx: Tx, by: string, input: Partial<TenantSettings>) {
  const value = tenantSettingsSchema.parse(input);
  await tx.platformSetting.upsert({ where: { key: "tenant_defaults.settings" }, create: { key: "tenant_defaults.settings", value, updatedBy: by }, update: { value, updatedBy: by } });
}

/** Tenant columns for a new synagogue from the defaults. */
export function tenantDataFromDefaults(d: { reminders: ReminderDefaults; settings: TenantSettings }) {
  return {
    remindersEnabled: d.reminders.enabled,
    reminderFirstDelayDays: d.reminders.firstDelayDays,
    reminderIntervalDays: d.reminders.intervalDays,
    reminderDays: d.reminders.days,
    reminderHour: d.reminders.hour,
    reminderMinute: d.reminders.minute,
    reminderSkipHolidays: d.reminders.skipHolidays,
    reminderTemplate: d.reminders.template,
    settings: d.settings,
  };
}
