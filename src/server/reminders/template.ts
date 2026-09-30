import { formatILS } from "../money";

// Reminder text. The gabbai may customise it; placeholders are replaced, anything else is literal text.
export const PLACEHOLDERS = ["{שם}", "{שם_מלא}", "{סכום}", "{בית_כנסת}", "{קישור}"] as const;

export const DEFAULT_TEMPLATE =
  "שלום {שם}, תזכורת מ{בית_כנסת}: היתרה הפתוחה שלך היא {סכום}. לצפייה ולתשלום: {קישור}";

const OPT_OUT_LINE = '\nלהפסקת תזכורות השיבו "הסר".';

export function validateTemplate(t: string): string | null {
  const s = t.trim();
  if (s.length < 10) return "הנוסח קצר מדי.";
  if (s.length > 700) return "הנוסח ארוך מדי (עד 700 תווים).";
  if (!s.includes("{קישור}")) return "הנוסח חייב לכלול {קישור} כדי שהמתפלל יוכל לצפות ולשלם.";
  const unknown = (s.match(/\{[^}]*\}/g) ?? []).filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p));
  if (unknown.length) return `שדה לא מוכר: ${unknown.join(", ")}`;
  return null;
}

export function renderReminder(
  template: string | null | undefined,
  v: { firstName: string; lastName: string; debtAgorot: number; synagogueName: string; link: string },
) {
  const text = (template?.trim() || DEFAULT_TEMPLATE)
    .replaceAll("{שם_מלא}", `${v.firstName} ${v.lastName}`.trim())
    .replaceAll("{שם}", v.firstName)
    .replaceAll("{סכום}", formatILS(v.debtAgorot))
    .replaceAll("{בית_כנסת}", v.synagogueName)
    .replaceAll("{קישור}", v.link);
  // The opt-out instruction is always appended – the gabbai cannot remove it.
  return text + OPT_OUT_LINE;
}
