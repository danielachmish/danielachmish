import { test, expect } from "@playwright/test";
import { openCard, ownerQuery, state } from "./helpers";

test.use({ storageState: state("gabbai1") });

test("gabbai sets the reminder policy: off, days, time, custom text", async ({ page }) => {
  await page.goto("/settings#reminders");
  const form = page.locator("form", { hasText: "שליחת תזכורות אוטומטית" });
  await form.getByRole("button", { name: "ג׳" }).click(); // toggle Tuesday off
  await form.getByLabel("שעת שליחה (שעון ישראל)").fill("18:30");
  await form.getByRole("switch", { name: /נוסח מותאם אישית/ }).check();
  await form.getByLabel("נוסח התזכורת").fill("שלום {שם}, נותרו {סכום}. לתשלום: {קישור}");
  await expect(form.getByLabel("תצוגה מקדימה")).toContainText("שלום ישראל, נותרו 180 ₪");
  await form.getByRole("button", { name: "שמירת מדיניות תזכורות" }).click();
  await expect(page.getByText("מדיניות התזכורות נשמרה")).toBeVisible();
  const [t] = await ownerQuery<{ h: number; m: number; d: number[]; tpl: string }>(
    `SELECT "reminderHour" h, "reminderMinute" m, "reminderDays" d, "reminderTemplate" tpl FROM "Tenant" WHERE name LIKE '%אוהל יעקב%'`,
  );
  expect(t).toMatchObject({ h: 18, m: 30, d: [0, 1, 3, 4] });
  expect(t!.tpl).toContain("{קישור}");

  // Turn automatic reminders off entirely
  await form.getByRole("switch", { name: /שליחת תזכורות אוטומטית/ }).uncheck();
  await form.getByRole("button", { name: "שמירת מדיניות תזכורות" }).click();
  await expect(page.getByText("תזכורות אוטומטיות כובו")).toBeVisible();
  await page.goto("/reminders");
  await expect(page.getByText("כבויות")).toBeVisible();
});

test("send a reminder now from a card; soft block asks for confirmation", async ({ page }) => {
  await openCard(page, "אברהם דוגמה");
  await page.getByRole("button", { name: "שליחת תזכורת עכשיו" }).click();
  await expect(page.getByText("התזכורת נשלחה.")).toBeVisible();
  // Second time within 24h → asks for explicit confirmation
  await page.getByRole("button", { name: "שליחת תזכורת עכשיו" }).click();
  await expect(page.getByText(/נשלחה תזכורת ב-24 השעות האחרונות\. לשלוח בכל זאת/)).toBeVisible();
  await page.getByRole("button", { name: "לשלוח בכל זאת" }).click();
  await expect(page.getByText("התזכורת נשלחה.")).toBeVisible();
  const [r] = await ownerQuery<{ n: number }>(`SELECT count(*)::int n FROM "OutboundMessage" WHERE trigger='manual' AND status='accepted'`);
  expect(r!.n).toBe(2);
});

test("card without consent: manual reminder is refused with a clear reason", async ({ page }) => {
  await openCard(page, "יצחק בדיקה");
  await page.getByRole("button", { name: "שליחת תזכורת עכשיו" }).click();
  await expect(page.getByText(/לא ניתן לשלוח: המתפלל לא נתן הסכמה להודעות/)).toBeVisible();
});

test("bulk reminder: preview then confirm", async ({ page }) => {
  await page.goto("/reminders");
  await page.getByRole("button", { name: /שליחת תזכורת לכל בעלי החוב/ }).click();
  await expect(page.getByText(/יישלחו עכשיו:/)).toBeVisible();
  await expect(page.getByText(/לא יישלח – ללא הסכמה/)).toBeVisible();
  await page.getByRole("button", { name: "אישור ושליחה" }).click();
  await expect(page.getByText(/תזכורות נכנסו לשליחה|0 תזכורות/)).toBeVisible();
});

test("behaviour settings: disable partial payment → hidden on the personal page", async ({ page }) => {
  await page.goto("/settings#behaviour");
  const form = page.locator("form", { hasText: "התנהגות" }).or(page.locator("form", { hasText: "תשלום חלקי" })).first();
  await form.getByRole("switch", { name: "תשלום חלקי" }).uncheck();
  await form.getByRole("button", { name: "שמירת הגדרות" }).click();
  await expect(page.getByText("ההגדרות נשמרו.")).toBeVisible();
  const [t] = await ownerQuery<{ s: { portalPartialPayment: boolean } }>(`SELECT settings s FROM "Tenant" WHERE name LIKE '%אוהל יעקב%'`);
  expect(t!.s.portalPartialPayment).toBe(false);
});

test("send from my WhatsApp: opens wa.me with the ready text in a new tab", async ({ page, context }) => {
  await openCard(page, "אברהם דוגמה");
  const waRequest = context.waitForEvent("request", { predicate: (r) => /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(r.url()), timeout: 20_000 });
  await page.getByRole("button", { name: "שליחה מהוואטסאפ שלי" }).click();
  const req = await waRequest;
  expect(req.url()).toMatch(/^https:\/\/wa\.me\/972502222222\?text=/);
  // Uses the synagogue's own reminder wording (set by an earlier test) and a personal link.
  expect(decodeURIComponent(req.url())).toMatch(/אברהם.*₪.*\/p#[A-Za-z0-9_-]{20,}/s);
  await page.goto("/reminders");
  await expect(page.getByText(/שליחה מהוואטסאפ שלי \(\d+ בעלי חוב\)/)).toBeVisible();
  await expect(page.locator("li", { hasText: "אברהם דוגמה" }).getByText("נשלחה ב-24 שעות")).toBeVisible();
});
