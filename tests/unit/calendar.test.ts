import { describe, expect, it } from "vitest";
import { nextSendWindow, reminderDueAt } from "@/server/reminders/calendar";
import { formatInTimeZone } from "date-fns-tz";

const local = (d: Date) => formatInTimeZone(d, "Asia/Jerusalem", "yyyy-MM-dd HH:mm EEE");

describe("send window (Asia/Jerusalem, Sun–Thu 10:00, no Yom Tov / Chol HaMoed)", () => {
  it("same day 10:00 when before 10 on a weekday", () => {
    expect(local(nextSendWindow(new Date("2026-11-02T05:00:00Z")))).toBe("2026-11-02 10:00 Mon");
  });
  it("Friday → Sunday", () => {
    expect(local(nextSendWindow(new Date("2026-11-06T09:00:00Z")))).toBe("2026-11-08 10:00 Sun");
  });
  it("after 10:00 → next allowed day", () => {
    expect(local(nextSendWindow(new Date("2026-11-02T12:00:00Z")))).toBe("2026-11-03 10:00 Tue");
  });
  it("skips Sukkot and Chol HaMoed and Shmini Atzeret (Sep 26 – Oct 3, 2026)", () => {
    expect(local(nextSendWindow(new Date("2026-09-25T20:00:00Z")))).toBe("2026-10-04 10:00 Sun");
  });
  it("skips Yom Kippur 2026 (Mon Sep 21)", () => {
    expect(local(nextSendWindow(new Date("2026-09-21T03:00:00Z")))).toBe("2026-09-22 10:00 Tue");
  });
  it("uses the correct UTC offset on both sides of the DST change (Oct 25 2026)", () => {
    expect(nextSendWindow(new Date("2026-10-22T00:00:00Z")).toISOString()).toBe("2026-10-22T07:00:00.000Z"); // IDT +3
    expect(nextSendWindow(new Date("2026-10-26T00:00:00Z")).toISOString()).toBe("2026-10-26T08:00:00.000Z"); // IST +2
  });
});

describe("reminder due date", () => {
  const base = new Date("2026-09-01T00:00:00Z");
  it("first reminder 7 days after due/pledge date", () => {
    expect(reminderDueAt({ oldestOpenDate: base, lastReminderAt: null, firstDelayDays: 7, intervalDays: 30 }).toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });
  it("then at most one every 30 days", () => {
    const last = new Date("2026-09-10T07:00:00Z");
    expect(reminderDueAt({ oldestOpenDate: base, lastReminderAt: last, firstDelayDays: 7, intervalDays: 30 }).toISOString()).toBe("2026-10-10T07:00:00.000Z");
  });
});
