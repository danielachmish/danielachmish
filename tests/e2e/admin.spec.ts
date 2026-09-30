import { test, expect } from "@playwright/test";
import { state } from "./helpers";

test.use({ storageState: state("admin") });

test("admin sees synagogues and subscriptions but no congregant data", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("אוהל יעקב")).toBeVisible();
  await expect(page.getByText("היכל שלמה")).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toContain("אברהם");
  await page.getByRole("link", { name: /אוהל יעקב/ }).click();
  await expect(page.getByText("אין הרשאת תמיכה פעילה")).toBeVisible();
});

test("admin cannot open gabbai screens", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
