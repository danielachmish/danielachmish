import { describe, expect, it } from "vitest";
import { agorotToPlain, formatILS, parseShekelsToAgorot } from "@/server/money";
import { csvCell, parseCsv, toCsv } from "@/server/util/csv";
import { normalizePhone } from "@/server/util/phone";
import { loadConfig } from "@/server/config";

describe("money parsing without floats", () => {
  it.each([
    ["180", 18000],
    ["0.1", 10],
    ["1,234.56", 123456],
    ["₪ 12.5", 1250],
    ["19.99", 1999],
    ['100 ש"ח', 10000],
  ])("%s → %d agorot", (s, a) => expect(parseShekelsToAgorot(s)).toBe(a));
  it.each(["", "-5", "1.234", "abc", "0", "1e3", "12,34.5.6"])("rejects %s", (s) => expect(() => parseShekelsToAgorot(s)).toThrow());
  it("formats", () => {
    expect(agorotToPlain(123405)).toBe("1234.05");
    expect(agorotToPlain(-100)).toBe("-1");
    expect(formatILS(123450)).toBe("1,234.50 ₪");
  });
});

describe("csv", () => {
  it("neutralises formula injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+972")).toBe("'+972");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
  it("round-trips quoted fields and CRLF", () => {
    const text = toCsv([["שם", "הערה"], ["כהן", 'שורה "א", ב']]);
    expect(parseCsv(text)).toEqual([["שם", "הערה"], ["כהן", 'שורה "א", ב']]);
  });
});

describe("phone normalisation", () => {
  it.each([
    ["050-1234567", "+972501234567"],
    ["+972 50 123 4567", "+972501234567"],
    ["00972501234567", "+972501234567"],
    ["972501234567", "+972501234567"],
    ["02-6234567", "+97226234567"],
  ])("%s → %s", (i, o) => expect(normalizePhone(i)).toBe(o));
  it("rejects junk", () => expect(normalizePhone("12")).toBeNull());
});

describe("configuration guards", () => {
  const base = {
    APP_BASE_URL: "https://app.example.org",
    DATABASE_URL: "postgres://x",
    BETTER_AUTH_SECRET: "x".repeat(40),
    APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  };
  it("refuses fake providers in production", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", PROVIDER_MODE: "fake", OTP_CHANNEL: "whatsapp" })).toThrow(/PROVIDER_MODE/);
    expect(() => loadConfig({ ...base, NODE_ENV: "production", PROVIDER_MODE: "live", OTP_CHANNEL: "fake" })).toThrow(/OTP_CHANNEL/);
    expect(() => loadConfig({ ...base, NODE_ENV: "production", PROVIDER_MODE: "live", OTP_CHANNEL: "sms", APP_BASE_URL: "http://localhost:3000" })).toThrow(/APP_BASE_URL/);
  });
  it("accepts live production config", () => {
    expect(loadConfig({ ...base, NODE_ENV: "production", PROVIDER_MODE: "live", OTP_CHANNEL: "sms" }).PROVIDER_MODE).toBe("live");
  });
  it("never echoes secret values in errors", () => {
    try {
      loadConfig({ ...base, APP_ENCRYPTION_KEY: "SUPERSECRETVALUE" });
    } catch (e) {
      expect((e as Error).message).not.toContain("SUPERSECRETVALUE");
    }
  });
});

import { parseDate } from "@/server/gabbai/import-export";
describe("date parsing for imports", () => {
  it.each(["2026-09-01", "1/9/2026", "01.09.2026"])("accepts %s", (s) => expect(parseDate(s)?.toISOString().slice(0, 10)).toBe("2026-09-01"));
  it.each(["31/31/2026", "30/02/2026", "2026-13-01", "2026-02-30", "1/1/26", "abc"])("rejects %s", (s) => expect(parseDate(s)).toBeNull());
});
