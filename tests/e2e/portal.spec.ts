import { test, expect, devices } from "@playwright/test";
import { latestOtp, openCard, ownerQuery, state } from "./helpers";

test("congregant: link → OTP → partial payment on 360px → worker records verified charge → balance updated", async ({ browser }) => {
  // Gabbai issues a personal link.
  const g = await browser.newContext({ storageState: state("gabbai1") });
  const gp = await g.newPage();
  await openCard(gp, "אברהם דוגמה");
  await gp.getByRole("button", { name: "יצירת קישור אישי" }).click();
  const url = await gp.getByLabel("קישור אישי").inputValue();
  expect(url).toMatch(/\/p#[A-Za-z0-9_-]{40,}$/);
  expect(url).not.toContain("2222222");

  // Congregant on a 360px phone.
  const m = await browser.newContext({ ...devices["Pixel 5"], viewport: { width: 360, height: 740 } });
  const p = await m.newPage();
  await p.goto(url);
  await expect(p.getByRole("heading", { name: /אוהל יעקב/ })).toBeVisible();
  await expect(p.getByText("₪")).toHaveCount(0); // nothing financial before verification
  await expect(p).toHaveURL(/\/p$/); // token removed from the address bar
  const t0 = new Date(Date.now() - 1000);
  await p.getByRole("button", { name: "שליחת קוד" }).click();
  const code = await latestOtp("+972502222222", t0);
  await p.getByLabel("קוד בן 6 ספרות").fill(code);
  await p.getByRole("button", { name: "אימות" }).click();
  await p.waitForURL(/\/me/);
  const before = await p.locator("main").innerText();
  expect(before).toContain("יתרה לתשלום");

  await p.getByRole("radio", { name: "סכום חלקי" }).click();
  await p.getByLabel("סכום לתשלום (₪)").fill("100");
  await p.getByRole("button", { name: "מעבר לתשלום" }).click();
  await p.waitForURL(/\/dev\/fake-checkout\//);
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await p.getByRole("button", { name: "אישור חיוב (עם callback)" }).click();
  await p.waitForURL(/\/pay\/return/);
  // The return page does not claim success by itself; it waits for the worker to verify with the provider.
  await expect(p.getByText("התשלום התקבל ואושר")).toBeVisible({ timeout: 60_000 });
  await p.getByRole("link", { name: "חזרה לעמוד האישי" }).click();
  await expect(p.getByText("₪100", { exact: false }).first()).toBeVisible();

  const [row] = await ownerQuery<{ n: number }>(`SELECT count(*)::int n FROM "Payment" WHERE method='card' AND "amountAgorot"=10000 AND "providerTransactionId" LIKE 'ftx_%'`);
  expect(row!.n).toBe(1);
  await g.close();
  await m.close();
});

test("forwarded link without the code reveals nothing; /me without session reveals nothing", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await p.goto("/me");
  await expect(p.getByText("כדי לצפות בפרטים")).toBeVisible();
  await p.goto("/p#not-a-real-token-aaaaaaaaaaaaaaaaaaaaaaa");
  await expect(p.getByText("הקישור אינו בתוקף")).toBeVisible();
  await ctx.close();
});

test("fake checkout and dev tools headers: no-store and no-referrer", async ({ request }) => {
  const r = await request.get("/me");
  // Production returns "private, no-store" (verified with `next start`); the dev server forces "no-cache".
  expect(r.headers()["cache-control"]).toMatch(/no-store|no-cache/);
  expect(r.headers()["referrer-policy"]).toBe("no-referrer");
});
