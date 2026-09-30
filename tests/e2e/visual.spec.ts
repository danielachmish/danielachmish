import { test, expect } from "@playwright/test";
import { openCard, state } from "./helpers";

// Visual pass for core screens at 360 / 768 / 1440. Screenshots are kept in test-results/screens for review.
const widths = [360, 768, 1440];
test.use({ storageState: state("gabbai1") });

for (const w of widths) {
  test(`core screens render RTL without horizontal scroll at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    for (const [name, go] of [
      ["dashboard", () => page.goto("/dashboard")],
      ["congregants", () => page.goto("/congregants")],
      ["card", () => openCard(page, "יצחק בדיקה")],
      ["batch", () => page.goto("/pledges/batch")],
      ["payments", () => page.goto("/payments")],
      ["settings", () => page.goto("/settings")],
      ["reports", () => page.goto("/reports")],
      ["activity", () => page.goto("/activity")],
      ["pledge-import", () => page.goto("/pledges/import")],
      ["reconcile", () => page.goto("/payments/reconcile")],
    ] as const) {
      await go();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${name} overflows at ${w}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/screens/${name}-${w}.png`, fullPage: true });
    }
  });
}
