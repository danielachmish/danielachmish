import { test, expect } from "@playwright/test";
import { state } from "./helpers";

test.use({ storageState: state("admin") });

test("admin connects payment for a synagogue on its behalf and sees system health", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/health");
  await expect(page.getByRole("heading", { name: "תקינות המערכת" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.goto("/admin/tenants");
  await page.getByRole("link", { name: /היכל שלמה/ }).click();
  await page.getByRole("link", { name: "חיבורים", exact: true }).click();
  const card = page.locator("section", { hasText: "חיבור סליקה" });
  await expect(card.getByText("מחובר")).toBeVisible();
  await card.getByRole("button", { name: "החלפת חשבון" }).click();
  await card.getByLabel("מזהה חשבון דמה").fill("pay-demo-2b");
  await card.getByLabel("סוד חתימה (דמה)").fill("new-secret");
  await card.getByRole("button", { name: "החלפה לחשבון החדש" }).click();
  await expect(page.getByText("החיבור נשמר עבור בית הכנסת.")).toBeVisible();
  await expect(card.getByText("pay-demo-2b")).toBeVisible();
});

test("admin onboarding wizard: three steps, nothing created before the last", async ({ page }) => {
  await page.goto("/admin/onboard");
  await page.getByLabel("שם בית הכנסת").fill("בית כנסת אשף");
  await page.getByRole("button", { name: "המשך" }).click();
  await page.getByLabel("שם הגבאי").fill("גבאי אשף");
  await page.getByLabel("דוא״ל הגבאי").fill("wizard@example.test");
  await page.getByRole("button", { name: "המשך" }).click();
  await expect(page.getByText("wizard@example.test")).toBeVisible();
  await page.getByRole("button", { name: "יצירה ושליחת הזמנה" }).click();
  await page.waitForURL(/\/admin\/tenants\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "בית כנסת אשף" })).toBeVisible();
});

test("old defaults address leads to the settings tabs, which save", async ({ page }) => {
  await page.goto("/admin/defaults");
  await expect(page).toHaveURL(/\/admin\/settings\?tab=reminders/);
  const form = page.locator("form", { hasText: "שליחת תזכורות אוטומטית" });
  await form.getByLabel("שעת שליחה (שעון ישראל)").fill("09:30");
  await form.getByRole("button", { name: "שמירת מדיניות תזכורות" }).click();
  await expect(page.getByText(/ברירות המחדל לתזכורות נשמרו/)).toBeVisible();
});
