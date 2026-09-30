import { beforeEach, describe, expect, it } from "vitest";
import { asTenant, d, gabbai, makeCongregant, makeSubscription, makeTenant, truncateAll } from "./helpers";
import { createPledge, recordVerifiedCardPayment } from "@/server/ledger/engine";
import { grantFamilyAccess } from "@/server/gabbai/congregants";
import { otherSynagogues, portalIdentity, requestOtp, startPhoneLogin, switchSynagogue, verifyOtp } from "@/server/portal/links";
import { portalOverview } from "@/server/portal/actions";
import { receiveMessagingWebhook, processMessagingEvent } from "@/server/messaging/bot";
import { hmacSha256 } from "@/server/crypto";
import { prisma } from "@/server/db/client";

process.env.QUEUE_DISABLED = "true";
const PHONE = "+972533334444";
let A: string, B: string;

const lastCode = async () =>
  ((await prisma.devFakeRecord.findMany({ where: { kind: "otp" }, orderBy: { createdAt: "desc" }, take: 1 }))[0]!.data as { code: string }).code;

beforeEach(async () => {
  await truncateAll();
  A = await makeTenant("אוהל יעקב");
  B = await makeTenant("היכל שלמה");
  await makeSubscription(A);
  const a = await makeCongregant(A, { firstName: "משה", phone: PHONE });
  await makeCongregant(B, { firstName: "משה", phone: PHONE });
  await asTenant(A, (tx) => createPledge(tx, A, gabbai(), { congregantId: a.id, amountAgorot: 18000, pledgeDate: d("2026-09-01"), description: "שלישי" }));
  await asTenant(A, (tx) => createPledge(tx, A, gabbai(), { congregantId: a.id, amountAgorot: 12000, pledgeDate: d("2026-09-05"), category: "מפטיר" }));
});

describe("congregant login with phone + code", () => {
  it("registered phone → code → session; can switch to the other synagogue without a new code", async () => {
    const { ticket } = await startPhoneLogin("053-3334444");
    expect(ticket).toBeTruthy();
    const s = await verifyOtp(ticket!, await lastCode());
    const p = (await portalIdentity(s.sessionToken))!;
    expect(p.tenantId).toBe(A);
    expect((await portalOverview(p)).summary.debtAgorot).toBe(30000);
    expect(await otherSynagogues(p)).toEqual([{ tenantId: B, name: "היכל שלמה" }]);
    const s2 = await switchSynagogue(p, B);
    const p2 = (await portalIdentity(s2.sessionToken))!;
    expect(p2.tenantId).toBe(B);
    expect((await portalOverview(p2)).summary.debtAgorot).toBe(0);
  });

  it("unknown phone gets no ticket and no code is sent", async () => {
    expect((await startPhoneLogin("058-0000001")).ticket).toBeNull();
    expect(await prisma.devFakeRecord.count({ where: { kind: "otp" } })).toBe(0);
  });

  it("cannot switch into a synagogue where the phone is not registered", async () => {
    const C = await makeTenant("אחר");
    const { ticket } = await startPhoneLogin(PHONE);
    const p = (await portalIdentity((await verifyOtp(ticket!, await lastCode())).sessionToken))!;
    await expect(switchSynagogue(p, C)).rejects.toMatchObject({ code: "not_found" });
  });

  it("code limits are per phone, so starting new logins cannot bypass them", async () => {
    for (let i = 0; i < 3; i++) await startPhoneLogin(PHONE);
    await expect(startPhoneLogin(PHONE)).rejects.toMatchObject({ code: "otp_rate_limited" });
    void requestOtp;
  });
});

describe("WhatsApp '1' – detailed debt statement", () => {
  it("lists every open pledge with date, description and remaining amount, plus totals and a link", async () => {
    await asTenant(A, (tx) => tx.integrationAccount.create({ data: { tenantId: A, kind: "messaging", provider: "fake", environment: "fake", externalAccountId: "wa-A" } }));
    const pay = await asTenant(A, (tx) => tx.integrationAccount.create({ data: { tenantId: A, kind: "payment", provider: "fake", environment: "fake", externalAccountId: "p-A" } }));
    const card = await asTenant(A, (tx) => tx.congregant.findFirstOrThrow());
    await asTenant(A, (tx) =>
      recordVerifiedCardPayment(tx, A, { type: "provider", id: "x" }, {
        congregantId: card.id, amountAgorot: 5000, currency: "ILS", integrationAccountId: pay.id,
        identity: { provider: "fake", environment: "fake", accountId: "p-A", transactionId: "t1" },
      }),
    );
    const spouse = await makeCongregant(A, { firstName: "שרה", lastName: "ישראלי" });
    await asTenant(A, (tx) => createPledge(tx, A, gabbai(), { congregantId: spouse.id, amountAgorot: 3600, pledgeDate: d("2026-09-10"), description: "קידוש" }));
    await asTenant(A, (tx) => grantFamilyAccess(tx, A, gabbai(), spouse.id, PHONE));

    const raw = JSON.stringify({ account: "wa-A", messages: [{ from: PHONE, text: "החובות שלי", id: "m-stmt" }] });
    const r = await receiveMessagingWebhook("fake", new Headers({ "x-fake-signature": hmacSha256("dev-messaging-secret", raw) }), raw);
    if (r.outcome !== "accepted") throw new Error(r.outcome);
    await processMessagingEvent(A, r.eventId);
    const reply = await asTenant(A, (tx) => tx.outboundMessage.findFirstOrThrow({ where: { kind: "menu_reply" } }));
    const text = (reply.body as { text: string }).text;
    expect(text).toContain("החובות שלך באוהל יעקב:");
    expect(text).toContain("• 01.09.2026 – שלישי: 130 ₪ (שולם 50 ₪ מתוך 180 ₪)");
    expect(text).toContain("• 05.09.2026 – מפטיר: 120 ₪");
    expect(text).toContain("שרה ישראלי:");
    expect(text).toContain("• 10.09.2026 – קידוש: 36 ₪");
    expect(text).toContain("סה״כ לתשלום: 286 ₪");
    expect(text).toMatch(/לתשלום מאובטח.*\/p#/);
  });
});
