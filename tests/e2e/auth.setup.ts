import { test as setup, expect } from "@playwright/test";
import { PASSWORD, state } from "./helpers";

for (const who of ["gabbai1", "gabbai2", "admin"]) {
  setup(`login ${who}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("דוא״ל").fill(`${who}@example.test`);
    await page.getByLabel("סיסמה").fill(PASSWORD);
    await page.getByRole("button", { name: "כניסה" }).click();
    await expect(page).toHaveURL(who === "admin" ? /\/admin/ : /\/dashboard/);
    await page.context().storageState({ path: state(who) });
  });
}
