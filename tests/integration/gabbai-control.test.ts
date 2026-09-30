import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { asTenant, d, gabbai, makeCongregant, makeFakePaymentIntegration, makeSubscription, makeTenant, setTenant, truncateAll } from "./helpers";
import { createPledge, recordVerifiedCardPayment, reportExternalPayment } from "@/server/ledger/engine";
import { cardSummary } from "@/server/ledger/balance";
import { recordConsent } from "@/server/gabbai/congregants";
import {
  bulkReminderPreview,
  cancelScheduledReminder,
  dispatchMessage,
  dueMessages,
  scanReminders,
  sendBulkRemindersNow,
  sendReminderNow,
} from "@/server/reminders/service";
import { openInquiry } from "@/server/portal/actions";
import { createPaymentRequest } from "@/server/payments/requests";
import { processOutbox } from "@/server/outbox";
import { receiveMessagingWebhook, processMessagingEvent } from "@/server/messaging/bot";
import { hmacSha256 } from "@/server/crypto";
import { tenantCtx, withContext } from "@/server/db/context";
import { prisma } from "@/server/db/client";

process.env.QUEUE_DISABLED = "true";
const ils = (n: number) => n * 100;
let tenantId: string;
let cardId: string;
const PHONE = "+972502223344";
const ctx = () => tenantCtx(tenantId, gabbai(), "gabbai-1") as ReturnType<typeof tenantCtx> & { tenantId: string };
const monday7 = new Date("2026-11-02T05:00:00Z"); // Monday 07:00 Israel

beforeEach(async () => {
  await truncateAll();
  tenantId = await makeTenant("אוהל");
  await makeSubscription(tenantId);
  cardId = (await makeCongregant(tenantId, { phone: PHONE })).id;
  await asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: cardId, amountAgorot: ils(300), pledgeDate: d("2026-08-01") }));
  await asTenant(tenantId, (t) => recordConsent(t, tenantId, gabbai(), cardId, true));
  await asTenant(tenantId, (t) =>
    t.integrationAccount.create({ data: { tenantId, kind: "messaging", provider: "fake", environment: "fake", externalAccountId: `wa-${tenantId.slice(0, 6)}` } }),
  );
});

describe("automatic reminder policy decided by the gabbai", () => {
  it("disabled → nothing is scheduled; already scheduled auto reminders are not sent", async () => {
    await scanReminders(tenantId, monday7);
    await setTenant(tenantId, { remindersEnabled: false });
    expect((await scanReminders(tenantId, monday7)).disabled).toBe(true);
    const [m] = await dueMessages(tenantId, new Date("2026-11-02T09:00:00Z"));
    const r = await dispatchMessage(tenantId, m!.id, new Date("2026-11-02T09:00:00Z"));
    expect(r.sent).toBe(false);
    const msg = await asTenant(tenantId, (t) => t.outboundMessage.findFirstOrThrow());
    expect(msg.skipReason).toContain("auto_disabled");
  });

  it("custom days/hour are used (Tuesday 18:30)", async () => {
    await setTenant(tenantId, { reminderDays: [2], reminderHour: 18, reminderMinute: 30 });
    await scanReminders(tenantId, monday7);
    const m = await asTenant(tenantId, (t) => t.outboundMessage.findFirstOrThrow());
    expect(m.scheduledFor.toISOString()).toBe("2026-11-03T16:30:00.000Z");
  });

  it("custom first delay: not due yet → not scheduled", async () => {
    await setTenant(tenantId, { reminderFirstDelayDays: 200 });
    expect((await scanReminders(tenantId, monday7)).scheduled).toBe(0);
  });

  it("custom template is used in the sent message", async () => {
    await setTenant(tenantId, { reminderTemplate: "היי {שם}, נשאר {סכום}. {קישור}" });
    await scanReminders(tenantId, monday7);
    const [m] = await dueMessages(tenantId, new Date("2026-11-02T09:00:00Z"));
    await dispatchMessage(tenantId, m!.id, new Date("2026-11-02T09:00:00Z"));
    const sent = await asTenant(tenantId, (t) => t.outboundMessage.findFirstOrThrow());
    expect((sent.body as { text: string }).text).toMatch(/^היי ישראל, נשאר 300 ₪\. https?:\/\/.+\/p#.+\nלהפסקת תזכורות/);
  });

  it("gabbai can cancel a scheduled reminder", async () => {
    await scanReminders(tenantId, monday7);
    const m = await asTenant(tenantId, (t) => t.outboundMessage.findFirstOrThrow());
    await cancelScheduledReminder(ctx(), m.id, "gabbai-1");
    expect(await dueMessages(tenantId, new Date("2026-11-03T00:00:00Z"))).toEqual([]);
    await expect(cancelScheduledReminder(ctx(), m.id, "gabbai-1")).rejects.toMatchObject({ code: "not_scheduled" });
  });

  it("pause after payment link is configurable (0 = no pause)", async () => {
    await makeFakePaymentIntegration(tenantId);
    await createPaymentRequest({ kind: "portal", tenantId, congregantIds: [cardId], actor: { type: "congregant", id: cardId } }, {
      congregantId: cardId,
      idempotencyKey: randomUUID(),
      via: "portal",
    });
    expect((await scanReminders(tenantId, monday7)).scheduled).toBe(0);
    await setTenant(tenantId, { settings: { pauseAfterPaymentLinkHours: 0 } });
    expect((await scanReminders(tenantId, monday7)).scheduled).toBe(1);
  });
});

describe("manual sending at any time", () => {
  it("sends immediately, even when automatic reminders are off; double click sends once", async () => {
    await setTenant(tenantId, { remindersEnabled: false });
    const op = randomUUID();
    const [a, b] = await Promise.all([
      sendReminderNow(ctx(), { congregantId: cardId, overrideSoft: false, clientOpId: op, requestedBy: "gabbai-1" }),
      sendReminderNow(ctx(), { congregantId: cardId, overrideSoft: false, clientOpId: op, requestedBy: "gabbai-1" }).catch((e) => e),
    ]);
    expect([a, b].some((x) => (x as { status?: string }).status === "sent")).toBe(true);
    expect(await prisma.devFakeRecord.count({ where: { kind: "message" } })).toBe(1);
    const m = await asTenant(tenantId, (t) => t.outboundMessage.findFirstOrThrow());
    expect(m).toMatchObject({ trigger: "manual", status: "accepted" });
  });

  it("hard blocks (no consent / opt-out / no debt) are never overridable", async () => {
    await asTenant(tenantId, (t) => recordConsent(t, tenantId, gabbai(), cardId, false));
    await expect(sendReminderNow(ctx(), { congregantId: cardId, overrideSoft: true, clientOpId: randomUUID(), requestedBy: "g" })).rejects.toMatchObject({
      code: "reminder_blocked",
    });
    expect(await prisma.devFakeRecord.count({ where: { kind: "message" } })).toBe(0);
  });

  it("soft blocks (open inquiry, recent reminder) need explicit confirmation", async () => {
    await asTenant(tenantId, (t) => openInquiry(t, tenantId, cardId, "?", "test"));
    await expect(sendReminderNow(ctx(), { congregantId: cardId, overrideSoft: false, clientOpId: randomUUID(), requestedBy: "g" })).rejects.toMatchObject({
      code: "reminder_needs_confirmation",
    });
    const r = await sendReminderNow(ctx(), { congregantId: cardId, overrideSoft: true, clientOpId: randomUUID(), requestedBy: "g" });
    expect(r.status).toBe("sent");
    // A second one within 24h asks again.
    await expect(sendReminderNow(ctx(), { congregantId: cardId, overrideSoft: false, clientOpId: randomUUID(), requestedBy: "g" })).rejects.toMatchObject({
      code: "reminder_needs_confirmation",
    });
  });

  it("a manual reminder replaces the queued automatic one and resets the interval", async () => {
    await scanReminders(tenantId, monday7);
    await sendReminderNow(ctx(), { congregantId: cardId, overrideSoft: false, clientOpId: randomUUID(), requestedBy: "g" });
    const msgs = await asTenant(tenantId, (t) => t.outboundMessage.findMany({ orderBy: { createdAt: "asc" } }));
    expect(msgs.map((m) => [m.trigger, m.status])).toEqual([
      ["auto", "skipped"],
      ["manual", "accepted"],
    ]);
    expect((await scanReminders(tenantId, new Date(Date.now() + 5 * 86400_000))).scheduled).toBe(0);
  });

  it("bulk: preview shows who will and will not get it; send queues only eligible cards", async () => {
    const noConsent = await makeCongregant(tenantId, { phone: "+972503334455", firstName: "ב" });
    await asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: noConsent.id, amountAgorot: 100, pledgeDate: d("2026-08-01") }));
    const pending = await makeCongregant(tenantId, { phone: "+972504445566", firstName: "ג" });
    await asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: pending.id, amountAgorot: 100, pledgeDate: d("2026-08-01") }));
    await asTenant(tenantId, (t) => recordConsent(t, tenantId, gabbai(), pending.id, true));
    await asTenant(tenantId, (t) => reportExternalPayment(t, tenantId, gabbai(), { congregantId: pending.id, amountAgorot: 100, method: "check" }));
    await makeCongregant(tenantId, { phone: "+972505556677", firstName: "ללא חוב" });

    const p = await bulkReminderPreview(ctx());
    expect(p.eligible).toBe(1);
    expect(p.skipped).toMatchObject({ no_consent: 1, pending_external_payment: 1 });
    const op = randomUUID();
    const r = await sendBulkRemindersNow(ctx(), { clientOpId: op, requestedBy: "g" });
    expect(r.queued).toBe(1);
    expect((await sendBulkRemindersNow(ctx(), { clientOpId: op, requestedBy: "g" })).queued).toBe(0); // same click
    const due = await dueMessages(tenantId);
    for (const m of due) await dispatchMessage(tenantId, m.id);
    expect(await prisma.devFakeRecord.count({ where: { kind: "message" } })).toBe(1);
  });
});

describe("other behaviour controlled by the gabbai", () => {
  const portal = () => ({ kind: "portal" as const, tenantId, congregantIds: [cardId], actor: { type: "congregant" as const, id: cardId } });

  it("partial payment / pledge selection / minimum amount", async () => {
    await makeFakePaymentIntegration(tenantId);
    await setTenant(tenantId, { settings: { portalPartialPayment: false, portalSelectPledges: false } });
    await expect(createPaymentRequest(portal(), { congregantId: cardId, amountAgorot: ils(10), idempotencyKey: randomUUID(), via: "portal" })).rejects.toMatchObject({ code: "partial_disabled" });
    const pl = await asTenant(tenantId, (t) => t.pledge.findFirstOrThrow());
    await expect(createPaymentRequest(portal(), { congregantId: cardId, pledgeIds: [pl.id], idempotencyKey: randomUUID(), via: "portal" })).rejects.toMatchObject({ code: "select_disabled" });
    await setTenant(tenantId, { settings: { portalMinPartialAgorot: ils(50) } });
    await expect(createPaymentRequest(portal(), { congregantId: cardId, amountAgorot: ils(10), idempotencyKey: randomUUID(), via: "portal" })).rejects.toMatchObject({ code: "below_minimum" });
    expect((await createPaymentRequest(portal(), { congregantId: cardId, amountAgorot: ils(60), idempotencyKey: randomUUID(), via: "portal" })).paymentUrl).toBeTruthy();
  });

  it("auto-apply credit can be turned off", async () => {
    await setTenant(tenantId, { settings: { autoApplyCredit: false } });
    const acc = await makeFakePaymentIntegration(tenantId);
    await asTenant(tenantId, (t) =>
      recordVerifiedCardPayment(t, tenantId, { type: "provider", id: "x" }, {
        congregantId: cardId, amountAgorot: ils(400), currency: "ILS", integrationAccountId: acc.id,
        identity: { provider: "fake", environment: "fake", accountId: acc.externalAccountId, transactionId: "t1" },
      }),
    );
    await asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: cardId, amountAgorot: ils(50), pledgeDate: d("2026-09-01") }));
    expect(await asTenant(tenantId, (t) => cardSummary(t, cardId))).toMatchObject({ debtAgorot: ils(50), creditAgorot: ils(100) });
  });

  it("payment confirmation message can be turned off", async () => {
    await setTenant(tenantId, { settings: { paymentConfirmationMessage: false } });
    const acc = await makeFakePaymentIntegration(tenantId);
    await asTenant(tenantId, (t) =>
      recordVerifiedCardPayment(t, tenantId, { type: "provider", id: "x" }, {
        congregantId: cardId, amountAgorot: ils(100), currency: "ILS", integrationAccountId: acc.id,
        identity: { provider: "fake", environment: "fake", accountId: acc.externalAccountId, transactionId: "t2" },
      }),
    );
    expect(await processOutbox(tenantId)).toEqual([]);
  });

  it("bot menu hides disabled options and ignores them", async () => {
    await setTenant(tenantId, { settings: { portalReportExternalPayment: false, portalInquiry: false } });
    const account = `wa-${tenantId.slice(0, 6)}`;
    const raw = JSON.stringify({ account, messages: [{ from: PHONE, text: "3", id: "m3" }] });
    const r = await receiveMessagingWebhook("fake", new Headers({ "x-fake-signature": hmacSha256("dev-messaging-secret", raw) }), raw);
    if (r.outcome !== "accepted") throw new Error(r.outcome);
    await processMessagingEvent(tenantId, r.eventId);
    expect(await asTenant(tenantId, (t) => t.task.count())).toBe(0);
    const reply = await asTenant(tenantId, (t) => t.outboundMessage.findFirstOrThrow({ where: { kind: "menu_reply" } }));
    expect((reply.body as { text: string }).text).not.toContain("שילמתי בדרך אחרת");
    expect((reply.body as { text: string }).text).not.toContain("בירור חוב");
  });

  it("invalid settings values are rejected by the database constraints", async () => {
    await expect(setTenant(tenantId, { reminderHour: 25 })).rejects.toThrow();
    await expect(setTenant(tenantId, { reminderDays: [7] })).rejects.toThrow();
    void withContext;
  });
});
