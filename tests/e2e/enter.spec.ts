import { test, expect, devices } from "@playwright/test";
import { latestOtp, ownerQuery } from "./helpers";

const setPhoneLogin = (on: boolean) =>
  ownerQuery(
    `INSERT INTO "PlatformSetting" (key, value, "updatedAt") VALUES ('congregant_login', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = now()`,
    [JSON.stringify({ phoneLogin: on, codeChannel: null })],
  );

test.beforeAll(() => setPhoneLogin(true));
test.afterAll(() => setPhoneLogin(false));

test("phone login is hidden while the admin keeps it off", async ({ browser }) => {
  await setPhoneLogin(false);
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await p.goto("/login");
  await expect(p.getByRole("heading", { name: "כניסה" })).toBeVisible();
  await expect(p.getByText("כניסה עם מספר טלפון וקוד")).toHaveCount(0);
  expect((await p.goto("/enter"))!.status()).toBe(404);
  await setPhoneLogin(true);
  await p.goto("/login");
  await expect(p.getByRole("link", { name: "כניסה עם מספר טלפון וקוד" })).toBeVisible();
  await ctx.close();
});

test("congregant logs in with phone + code on a 360px phone and sees the debts", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Pixel 5"], viewport: { width: 360, height: 740 }, storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await p.goto("/enter");
  await p.getByLabel("מספר טלפון נייד").fill("050-2222222");
  const t0 = new Date(Date.now() - 1000);
  await p.getByRole("button", { name: "שליחת קוד" }).click();
  await p.getByLabel("קוד בן 6 ספרות").fill(await latestOtp("+972502222222", t0));
  await p.getByRole("button", { name: "אימות וכניסה" }).click();
  await p.waitForURL(/\/me/);
  await expect(p.getByText("יתרה לתשלום")).toBeVisible();
  expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});

test("unknown number: same flow, wrong-code answer, nothing revealed", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await p.goto("/enter");
  await p.getByLabel("מספר טלפון נייד").fill("058-9999999");
  await p.getByRole("button", { name: "שליחת קוד" }).click();
  await expect(p.getByText("אם המספר רשום")).toBeVisible();
  await p.getByLabel("קוד בן 6 ספרות").fill("123456");
  await p.getByRole("button", { name: "אימות וכניסה" }).click();
  await expect(p.getByText("הקוד שגוי או שפג תוקפו")).toBeVisible();
  await ctx.close();
});
