// Money is integer agorot. Never use floating point for amounts.

export class MoneyParseError extends Error {}

const MAX_AGOROT = 100_000_000_00; // 100M ILS sanity cap

/** Parses "1,234.5", "1234.50", "₪ 12" into agorot. Rejects more than 2 decimals, negatives and garbage. */
export function parseShekelsToAgorot(input: string): number {
  const cleaned = input.replace(/[₪\s,]/g, "").replace(/ש"ח|ש״ח|שח/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) throw new MoneyParseError("סכום לא תקין. יש להזין מספר חיובי עם עד שתי ספרות אחרי הנקודה.");
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  const agorot = whole * 100 + frac;
  if (agorot <= 0) throw new MoneyParseError("הסכום חייב להיות גדול מאפס.");
  if (agorot > MAX_AGOROT) throw new MoneyParseError("הסכום גבוה מדי.");
  return agorot;
}

export function assertAgorot(n: number, { allowZero = false, allowNegative = false } = {}) {
  if (!Number.isSafeInteger(n)) throw new MoneyParseError("amount must be an integer number of agorot");
  if (!allowNegative && n < 0) throw new MoneyParseError("amount must not be negative");
  if (!allowZero && n === 0) throw new MoneyParseError("amount must not be zero");
}

/** 12345 -> "123.45"; 12300 -> "123" */
export function agorotToPlain(agorot: number): string {
  const sign = agorot < 0 ? "-" : "";
  const a = Math.abs(agorot);
  const whole = Math.floor(a / 100);
  const frac = a % 100;
  return `${sign}${whole}${frac ? "." + String(frac).padStart(2, "0") : ""}`;
}

/** Display format for the Hebrew UI, e.g. "‏1,234.50 ₪". */
export function formatILS(agorot: number): string {
  const sign = agorot < 0 ? "-" : "";
  const a = Math.abs(agorot);
  const whole = Math.floor(a / 100).toLocaleString("en-US");
  const frac = a % 100;
  return `${sign}${whole}${frac ? "." + String(frac).padStart(2, "0") : ""} ₪`;
}
