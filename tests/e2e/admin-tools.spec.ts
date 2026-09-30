import { test, expect } from "@playwright/test";
import { state } from "./helpers";

test.use({ storageState: state("admin") });

test("admin connects payment for a synagogue on its behalf and sees system health", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await expect(page.getByText("תקינות המערכת")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: /היכל שלמה/ }).click();
  const card = page.locator("section", { hasText: "חיבור סליקה" });
  await expect(card.getByText("מחובר")).toBeVisible();
  await card.getByRole("button", { name: "החלפת חשבון" }).click();
  await card.getByLabel("מזהה חשבון דמה").fill("pay-demo-2b");
  await card.getByLabel("סוד חתימה (דמה)").fill("new-secret");
  await card.getByRole("button", { name: "החלפה לחשבון החדש" }).click();
  await expect(page.getByText("החיבור נשמר עבור בית הכנסת.")).toBeVisible();
  await expect(card.getByText("pay-demo-2b")).toBeVisible();
});

test("admin defaults page saves", async ({ page }) => {
  await page.goto("/admin/defaults");
  const form = page.locator("form", { hasText: "שליחת תזכורות אוטומטית" });
  await form.getByLabel("שעת שליחה (שעון ישראל)").fill("09:30");
  await form.getByRole("button", { name: "שמירת מדיניות תזכורות" }).click();
  await expect(page.getByText(/ברירות המחדל לתזכורות נשמרו/)).toBeVisible();
});
