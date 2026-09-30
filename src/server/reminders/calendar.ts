import { HebrewCalendar, flags } from "@hebcal/core";
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";

// Send window: Sunday–Thursday at 10:00 Asia/Jerusalem, skipping Yom Tov and Chol HaMoed (Israel schedule).
// Local time is converted with the IANA zone (handles DST); Israel is never treated as a fixed UTC offset.
export const TZ = "Asia/Jerusalem";
const SEND_HOUR = 10;

export function isBlockedDay(localDate: { y: number; m: number; d: number }): boolean {
  const dt = new Date(localDate.y, localDate.m - 1, localDate.d);
  const dow = dt.getDay(); // 0 Sunday … 6 Saturday
  if (dow === 5 || dow === 6) return true;
  const hs = HebrewCalendar.getHolidaysOnDate(dt, true) ?? [];
  return hs.some((h) => (h.getFlags() & (flags.CHAG | flags.CHOL_HAMOED)) !== 0);
}

/** Earliest allowed send instant (UTC Date) at or after `from`. */
export function nextSendWindow(from: Date): Date {
  const local = toZonedTime(from, TZ);
  let y = local.getFullYear();
  let m = local.getMonth() + 1;
  let d = local.getDate();
  for (let i = 0; i < 30; i++) {
    const candidate = fromZonedTime(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(SEND_HOUR).padStart(2, "0")}:00:00`, TZ);
    if (!isBlockedDay({ y, m, d }) && candidate.getTime() >= from.getTime()) return candidate;
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }
  throw new Error("no send window within 30 days");
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
