import { test, expect } from "@playwright/test";
import { state } from "./helpers";

test.use({ storageState: state("admin") });

test("admin dashboard: aggregates only, no congregant data", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "לוח בקרה" })).toBeVisible();
  await expect(page.getByText("משפך הצטרפות")).toBeVisible();
  await expect(page.getByText("בתי כנסת פעילים")).toBeVisible();
  const text = await page.locator("main").innerText();
  for (const name of ["אברהם", "יצחק", "050-"]) expect(text).not.toContain(name);
});

test("admin panels: synagogues list → synagogue tabs; support data only with a grant", async ({ page }) => {
  await page.goto("/admin/tenants");
  await expect(page.getByRole("link", { name: /אוהל יעקב/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /היכל שלמה/ })).toBeVisible();
  expect(await page.locator("main").innerText()).not.toContain("אברהם");
  await page.getByRole("link", { name: /אוהל יעקב/ }).click();
  await expect(page.getByRole("link", { name: "סקירה", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "תמיכה", exact: true }).click();
  await expect(page.getByText("אין הרשאת תמיכה פעילה")).toBeVisible();
  for (const p of ["/admin/billing", "/admin/health", "/admin/support", "/admin/activity", "/admin/onboard", "/admin/settings"]) {
    expect((await page.goto(p))!.status(), p).toBe(200);
  }
});

test("admin cannot open gabbai screens", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
