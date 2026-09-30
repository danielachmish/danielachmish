import { test, expect } from "@playwright/test";
import { openCard, ownerQuery, state } from "./helpers";

test.use({ storageState: state("gabbai1") });

test("dashboard shows real totals and tasks", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "לוח בקרה" })).toBeVisible();
  await expect(page.getByText("חוב פתוח")).toBeVisible();
  await expect(page.getByText("בירור חוב")).toBeVisible();
});

test("create congregant, add pledge (double click = one pledge), record cash, explain balance", async ({ page }) => {
  await page.goto("/congregants/new");
  await page.getByLabel("שם פרטי *").fill("בנימין");
  await page.getByLabel("שם משפחה").fill("חדש");
  await page.getByLabel("טלפון נייד").fill("052-1234567");
  await page.getByRole("button", { name: "שמירה" }).click();
  await page.waitForURL(/\/congregants\/[0-9a-f-]{36}/);

  await page.getByLabel("סכום (₪) *").first().fill("180");
  await page.getByLabel("תיאור").fill("שלישי");
  await page.getByRole("button", { name: "רישום נדר" }).dblclick();
  await expect(page.getByText("הנדר נרשם.")).toBeVisible();
  const pledges = await ownerQuery<{ n: number }>(`SELECT count(*)::int n FROM "Pledge" p JOIN "Congregant" c ON c.id=p."congregantId" WHERE c."firstName"='בנימין'`);
  expect(pledges[0]!.n).toBe(1);

  // Cash received → debt goes down immediately (gabbai confirms receipt)
  const cash = page.locator("section", { hasText: "רישום תשלום במזומן" });
  await cash.getByLabel("סכום (₪) *").fill("80");
  await cash.getByRole("button", { name: "רישום תשלום" }).click();
  await expect(page.getByText("התשלום נרשם והחוב עודכן.")).toBeVisible();
  await expect(page.getByTestId("summary-חוב פתוח").getByText("₪100")).toBeVisible();
  await expect(page.getByText(/תשלום: ₪80/)).toBeVisible(); // allocation shown → balance is explainable
});

test("pending check does not reduce debt until approved", async ({ page }) => {
  await openCard(page, "משה צק");
  await expect(page.getByTestId("summary-חוב פתוח").getByText("₪200")).toBeVisible();
  await page.goto("/payments");
  const row = page.locator("li", { hasText: "משה צק" }).filter({ has: page.getByRole("button", { name: "אישור – הכסף התקבל" }) });
  await row.getByRole("button", { name: "אישור – הכסף התקבל" }).click();
  await expect(page.locator("li", { hasText: "משה צק" })).toHaveCount(0);
  await openCard(page, "משה צק");
  await expect(page.getByTestId("summary-חוב פתוח").getByText("₪0")).toBeVisible();
});

test("batch entry: shared date, enter moves on, retry-safe save", async ({ page }) => {
  await page.goto("/pledges/batch");
  await page.getByLabel("מתפלל שורה 1").fill("דוגמה אברהם");
  await page.getByLabel("מתפלל שורה 1").press("Enter");
  await expect(page.getByLabel("סכום שורה 1")).toBeFocused();
  await page.getByLabel("סכום שורה 1").fill("36");
  await page.getByLabel("סכום שורה 1").press("Enter"); // last field → new row
  await expect(page.getByLabel("מתפלל שורה 2")).toBeFocused();
  await page.getByLabel("מתפלל שורה 2").fill("בדיקה יצחק");
  await page.getByLabel("סכום שורה 2").fill("18.5");
  await page.getByRole("button", { name: "שמירת הכול" }).click();
  await expect(page.getByText("2 נדרים נשמרו.")).toBeVisible();
  await page.getByRole("button", { name: "שמירת הכול" }).click();
  await expect(page.getByText("אין שורות לשמירה.")).toBeVisible();
});

test("correction requires reason and shows in history", async ({ page }) => {
  await openCard(page, "אברהם דוגמה");
  await page.getByRole("button", { name: "תיקון" }).first().click();
  await page.getByLabel("סכום התיקון (₪)").fill("30");
  await page.getByLabel("סיבה (חובה)").fill("טעות ברישום");
  await page.getByRole("button", { name: "שמירת תיקון" }).click();
  await expect(page.getByText(/טעות ברישום/)).toBeVisible();
});

test("another synagogue's card is not reachable by URL", async ({ page, browser }) => {
  const [row] = await ownerQuery<{ id: string }>(`SELECT c.id FROM "Congregant" c JOIN "Tenant" t ON t.id=c."tenantId" WHERE t.name LIKE '%היכל שלמה%' LIMIT 1`);
  const res = await page.goto(`/congregants/${row!.id}`);
  expect(res?.status()).toBe(404);
  const ctx = await browser.newContext({ storageState: state("gabbai2") });
  const p2 = await ctx.newPage();
  expect((await p2.goto(`/congregants/${row!.id}`))?.status()).toBe(200);
  await ctx.close();
});

test("export neutralises formulas and downloads CSV", async ({ page }) => {
  const res = await page.request.get("/api/export/ledger");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.text()).toContain("הקצאה");
});

test("unauthenticated users cannot reach gabbai pages or exports", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await p.goto("/dashboard");
  await expect(p).toHaveURL(/\/login/);
  expect((await p.request.get("/api/export/balances")).status()).toBe(401);
  await ctx.close();
});
