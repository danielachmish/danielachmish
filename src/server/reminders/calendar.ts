import { HebrewCalendar, flags } from "@hebcal/core";
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";

// Send windows follow the synagogue's own policy (days, hour, holidays), in Asia/Jerusalem local time.
// Local time is converted with the IANA zone (handles DST); Israel is never treated as a fixed UTC offset.
export const TZ = "Asia/Jerusalem";

export type SendPolicy = { days: number[]; hour: number; minute: number; skipHolidays: boolean };
export const DEFAULT_POLICY: SendPolicy = { days: [0, 1, 2, 3, 4], hour: 10, minute: 0, skipHolidays: true };

export const policyOf = (t: { reminderDays: number[]; reminderHour: number; reminderMinute: number; reminderSkipHolidays: boolean }): SendPolicy => ({
  days: t.reminderDays,
  hour: t.reminderHour,
  minute: t.reminderMinute,
  skipHolidays: t.reminderSkipHolidays,
});

/** Yom Tov or Chol HaMoed on the Israel schedule. */
export function isHoliday(localDate: { y: number; m: number; d: number }): boolean {
  const hs = HebrewCalendar.getHolidaysOnDate(new Date(localDate.y, localDate.m - 1, localDate.d), true) ?? [];
  return hs.some((h) => (h.getFlags() & (flags.CHAG | flags.CHOL_HAMOED)) !== 0);
}

export function isBlockedDay(localDate: { y: number; m: number; d: number }, policy: SendPolicy = DEFAULT_POLICY): boolean {
  const dow = new Date(Date.UTC(localDate.y, localDate.m - 1, localDate.d)).getUTCDay(); // 0 Sunday … 6 Saturday
  if (!policy.days.includes(dow)) return true;
  return policy.skipHolidays && isHoliday(localDate);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Earliest allowed send instant (UTC Date) at or after `from`, per the policy. */
export function nextSendWindow(from: Date, policy: SendPolicy = DEFAULT_POLICY): Date {
  if (policy.days.length === 0) throw new Error("no sending days configured");
  const local = toZonedTime(from, TZ);
  let y = local.getFullYear();
  let m = local.getMonth() + 1;
  let d = local.getDate();
  for (let i = 0; i < 60; i++) {
    const candidate = fromZonedTime(`${y}-${pad(m)}-${pad(d)}T${pad(policy.hour)}:${pad(policy.minute)}:00`, TZ);
    if (!isBlockedDay({ y, m, d }, policy) && candidate.getTime() >= from.getTime()) return candidate;
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }
  throw new Error("no send window within 60 days");
}

export const localDateKey = (d: Date) => formatInTimeZone(d, TZ, "yyyy-MM-dd");

/** When the next reminder becomes due (before applying the send window). */
export function reminderDueAt(opts: {
  oldestOpenDate: Date; // due date of oldest open pledge, or its pledge date
  lastReminderAt: Date | null;
  firstDelayDays: number;
  intervalDays: number;
}): Date {
  const first = new Date(opts.oldestOpenDate.getTime() + opts.firstDelayDays * 86400_000);
  if (!opts.lastReminderAt) return first;
  const next = new Date(opts.lastReminderAt.getTime() + opts.intervalDays * 86400_000);
  return next > first ? next : first;
}
