import { test, expect, devices } from "@playwright/test";
import { PASSWORD, openCard, ownerQuery, state } from "./helpers";

const fresh = { storageState: { cookies: [], origins: [] } };

test("demo congregant signs in with e-mail + password on a phone and lands on his debts", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Pixel 5"], viewport: { width: 360, height: 740 }, ...fresh });
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByLabel("דוא״ל").fill("mitpalel@example.test");
  await p.getByLabel("סיסמה").fill(PASSWORD);
  await p.getByRole("button", { name: "כניסה", exact: true }).click();
  await p.waitForURL(/\/me/);
  await expect(p.getByRole("heading", { name: /אברהם/ })).toBeVisible();
  await expect(p.getByText("יתרה לתשלום")).toBeVisible();
  expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // a congregant account has no gabbai or admin access
  await p.goto("/dashboard");
  await expect(p).toHaveURL(/\/login/);
  await p.goto("/me");
  await p.getByRole("button", { name: "יציאה" }).click();
  await p.waitForURL(/\/login/);
  await ctx.close();
});

test("gabbai invites a congregant → he opens an account → verifies → sees only his card", async ({ browser }) => {
  const g = await browser.newContext({ storageState: state("gabbai1") });
  const gp = await g.newPage();
  await openCard(gp, "יצחק");
  await expect(gp.getByRole("heading", { name: "גישה לאפליקציה" })).toBeVisible();
  await gp.getByRole("button", { name: "קישור הזמנה להעתקה" }).click();
  const url = await gp.getByLabel("קישור הזמנה").inputValue();
  expect(url).toMatch(/\/invite#[A-Za-z0-9_-]{20,}$/);

  const c = await browser.newContext({ ...devices["Pixel 5"], ...fresh });
  const p = await c.newPage();
  await p.goto(url);
  await expect(p.getByText("שלום יצחק")).toBeVisible();
  await expect(p).not.toHaveURL(/#/); // token removed from the address bar
  await p.getByLabel("דוא״ל").fill("yitzhak@example.test");
  await p.getByLabel("סיסמה (לפחות 10 תווים)").fill("yitzhak-password-1");
  await p.getByLabel("אימות סיסמה").fill("yitzhak-password-1");
  await p.getByRole("button", { name: "יצירת חשבון" }).click();
  await expect(p.getByText("שלחנו קישור לאימות")).toBeVisible();

  // the same invitation cannot be used twice (fresh load: a fragment-only change would not reload the page)
  await p.goto("about:blank");
  await p.goto(url);
  await expect(p.getByText("ההזמנה אינה בתוקף")).toBeVisible();

  const [mail] = await ownerQuery<{ url: string }>(
    `SELECT data->>'url' url FROM "DevFakeRecord" WHERE kind='email' AND data->>'to'='yitzhak@example.test' ORDER BY "createdAt" DESC LIMIT 1`,
  );
  await p.goto(mail!.url);
  await p.goto("/login");
  await p.getByLabel("דוא״ל").fill("yitzhak@example.test");
  await p.getByLabel("סיסמה").fill("yitzhak-password-1");
  await p.getByRole("button", { name: "כניסה", exact: true }).click();
  await p.waitForURL(/\/me/);
  await expect(p.getByRole("heading", { name: /יצחק/ })).toBeVisible();
  await expect(p.getByText("אברהם")).toHaveCount(0);

  // the gabbai sees the connected account on the card and can disconnect it
  await gp.reload();
  await expect(gp.getByText("yitzhak@example.test")).toBeVisible();
  gp.once("dialog", (d) => d.accept());
  await gp.getByRole("button", { name: "ניתוק" }).click();
  await expect(gp.getByText("החשבון נותק מהכרטיס.")).toBeVisible();
  await p.goto("/me");
  await expect(p.getByText("כדי לצפות בפרטים")).toBeVisible();
  await g.close();
  await c.close();
});

test("admin decides about phone login and the code channel", async ({ browser }) => {
  const a = await browser.newContext({ storageState: state("admin") });
  const p = await a.newPage();
  await p.goto("/admin/defaults");
  await expect(p.getByRole("heading", { name: "כניסת מתפללים" })).toBeVisible();
  const box = p.getByLabel(/כניסת מתפללים עם מספר טלפון וקוד/);
  await expect(box).not.toBeChecked();
  await box.check();
  await p.getByLabel("לאן נשלח הקוד (כניסה בטלפון וקישורים אישיים)").selectOption("email");
  await p.getByRole("button", { name: "שמירה" }).first().click();
  await expect(p.getByText("הגדרות הכניסה נשמרו.")).toBeVisible();
  const [row] = await ownerQuery<{ value: { phoneLogin: boolean; codeChannel: string } }>(`SELECT value FROM "PlatformSetting" WHERE key='congregant_login'`);
  expect(row!.value).toEqual({ phoneLogin: true, codeChannel: "email" });
  // restore the default for other tests
  await box.uncheck();
  await p.getByLabel("לאן נשלח הקוד (כניסה בטלפון וקישורים אישיים)").selectOption("");
  await p.getByRole("button", { name: "שמירה" }).first().click();
  await expect(p.getByText("הגדרות הכניסה נשמרו.")).toBeVisible();
  await a.close();
});
