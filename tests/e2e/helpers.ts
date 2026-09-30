import pg from "pg";
import { config } from "dotenv";
import type { Page } from "@playwright/test";

config({ path: ".env" });

export const PASSWORD = "demo-password-123";
export const state = (who: string) => `test-results/.auth/${who}.json`;

/** Reads the latest fake OTP for a phone (development fake channel only). */
export async function latestOtp(phoneE164: string, since: Date = new Date(0)): Promise<string> {
  const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await c.connect();
  try {
    for (let i = 0; i < 20; i++) {
      const r = await c.query(
        `SELECT data->>'code' code FROM "DevFakeRecord" WHERE kind='otp' AND data->>'phone'=$1 AND "createdAt" > $2 ORDER BY "createdAt" DESC LIMIT 1`,
        [phoneE164, since],
      );
      if (r.rows[0]) return r.rows[0].code;
      await new Promise((res) => setTimeout(res, 250));
    }
    throw new Error("no otp");
  } finally {
    await c.end();
  }
}

export async function ownerQuery<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await c.connect();
  try {
    return (await c.query<T>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

export async function openCard(page: Page, name: string) {
  await page.goto(`/congregants?q=${encodeURIComponent(name)}`);
  await page.locator('main a[href^="/congregants/"]:not([href$="/new"]):not([href$="/import"])').first().click();
  await page.waitForURL(/\/congregants\/[0-9a-f-]{36}/);
}
