import { describe, expect, it } from "vitest";
import { renderReminder, validateTemplate } from "@/server/reminders/template";

describe("reminder template", () => {
  it("renders placeholders and always appends the opt-out line", () => {
    const t = renderReminder("שלום {שם_מלא}! חוב {סכום} ל{בית_כנסת}: {קישור}", {
      firstName: "משה",
      lastName: "כהן",
      debtAgorot: 18050,
      synagogueName: "אוהל יעקב",
      link: "https://x/p#t",
    });
    expect(t).toBe('שלום משה כהן! חוב 180.50 ₪ לאוהל יעקב: https://x/p#t\nלהפסקת תזכורות השיבו "הסר".');
  });
  it("default text when none set", () => {
    expect(renderReminder(null, { firstName: "א", lastName: "ב", debtAgorot: 100, synagogueName: "ס", link: "L" })).toContain("L");
  });
  it("validation: link required, unknown placeholders rejected, length", () => {
    expect(validateTemplate("שלום {שם}, יש חוב {סכום}")).toMatch(/קישור/);
    expect(validateTemplate("שלום {שם} {טלפון} {קישור}")).toMatch(/טלפון/);
    expect(validateTemplate("קצר")).toMatch(/קצר/);
    expect(validateTemplate("שלום {שם}, לתשלום: {קישור}")).toBeNull();
  });
});
