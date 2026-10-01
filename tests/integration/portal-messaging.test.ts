import { beforeEach, describe, expect, it } from "vitest";
import { asTenant, d, gabbai, makeCongregant, makeSubscription, makeTenant, truncateAll } from "./helpers";
import { createPledge, recordVerifiedCardPayment, reportExternalPayment } from "@/server/ledger/engine";
import { issuePersonalLink, portalIdentity, requestOtp, verifyOtp, linkLanding } from "@/server/portal/links";
import { portalOverview, portalOptOut } from "@/server/portal/actions";
import { recordConsent, updateCongregant, grantFamilyAccess } from "@/server/gabbai/congregants";
import { dispatchMessage, dueMessages, scanReminders } from "@/server/reminders/service";
import { receiveMessagingWebhook, processMessagingEvent } from "@/server/messaging/bot";
import { hmacSha256 } from "@/server/crypto";
import { withContext, tenantCtx } from "@/server/db/context";
import { prisma } from "@/server/db/client";

process.env.QUEUE_DISABLED = "true";
const ils = (n: number) => n * 100;
let tenantId: string;
let card: { id: string; phone: string | null };
const PHONE = "+972501112233";

async function lastOtp(phone: string) {
  const rows = await prisma.devFakeRecord.findMany({ where: { kind: "otp" }, orderBy: { createdAt: "desc" } });
  return (rows.map((r) => r.data as { phone: string; code: string }).find((r) => r.phone === phone))!.code;
}
async function login(token: string) {
  await requestOtp(token);
  const code = await lastOtp(PHONE);
  const s = await verifyOtp(token, code);
  return (await portalIdentity(s.sessionToken))!;
}
async function messagingAccount(tId: string, ext = "wa-1") {
  return withContext(tenantCtx(tId, gabbai()), (tx) =>
    tx.integrationAccount.create({ data: { tenantId: tId, kind: "messaging", provider: "fake", environment: "fake", externalAccountId: ext } }),
  );
}

beforeEach(async () => {
  await truncateAll();
  tenantId = await makeTenant("היכל שלמה");
  await makeSubscription(tenantId);
  card = await makeCongregant(tenantId, { phone: PHONE, firstName: "משה" });
  await asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: card.id, amountAgorot: ils(300), pledgeDate: d("2026-08-01") }));
});

describe("personal link + OTP", () => {
  it("landing reveals only synagogue name and masked phone", async () => {
    const { token } = await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g"));
    expect(token).not.toContain(PHONE.slice(-4));
    const l = await linkLanding(token);
    expect(l).toEqual({ synagogueName: "היכל שלמה", target: { kind: "phone", masked: expect.stringMatching(/2233$/) } });
    expect(JSON.stringify(l)).not.toContain("300");
  });

  it("correct code opens the card; forwarded link without code shows nothing", async () => {
    const { token } = await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g"));
    expect(await portalIdentity(undefined)).toBeNull();
    expect(await portalIdentity(token)).toBeNull(); // the link token is not a session
    const id = await login(token);
    const o = await portalOverview(id);
    expect(o.summary.debtAgorot).toBe(ils(300));
  });

  it("wrong codes are limited and then even the right code fails", async () => {
    const { token } = await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g"));
    await requestOtp(token);
    const code = await lastOtp(PHONE);
    for (let i = 0; i < 5; i++) await expect(verifyOtp(token, "000000" === code ? "111111" : "000000")).rejects.toMatchObject({ code: "otp_invalid" });
    await expect(verifyOtp(token, code)).rejects.toMatchObject({ code: "otp_invalid" });
  });

  it("OTP requests are rate limited", async () => {
    const { token } = await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g"));
    for (let i = 0; i < 3; i++) await requestOtp(token);
    await expect(requestOtp(token)).rejects.toMatchObject({ code: "otp_rate_limited" });
  });

  it("expired or revoked link reveals nothing; phone change kills existing sessions", async () => {
    const expired = await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g", -1));
    await expect(linkLanding(expired.token)).rejects.toMatchObject({ code: "link_invalid" });
    const { token } = await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g"));
    await requestOtp(token);
    const session = await verifyOtp(token, await lastOtp(PHONE));
    expect(await portalIdentity(session.sessionToken)).not.toBeNull();
    await asTenant(tenantId, (t) => updateCongregant(t, tenantId, gabbai(), card.id, { firstName: "משה", lastName: "ישראלי", phone: "0529999999" }));
    expect(await portalIdentity(session.sessionToken)).toBeNull();
    await expect(linkLanding(token)).rejects.toMatchObject({ code: "link_invalid" });
  });

  it("congregant sees only their card; other card in same synagogue is hidden", async () => {
    const other = await makeCongregant(tenantId, { firstName: "אחר", phone: "+972507770000" });
    const { token } = await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g"));
    const id = await login(token);
    expect(id.congregantIds).toEqual([card.id]);
    await expect(portalOverview(id, other.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("family card only with explicit permission", async () => {
    const spouse = await makeCongregant(tenantId, { firstName: "שרה", lastName: "ישראלי" });
    const { token } = await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g"));
    expect((await login(token)).congregantIds).toEqual([card.id]);
    await asTenant(tenantId, (t) => grantFamilyAccess(t, tenantId, gabbai(), spouse.id, PHONE));
    const token2 = (await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g"))).token;
    await new Promise((r) => setTimeout(r, 5));
    const id2 = await login(token2);
    expect(id2.congregantIds.sort()).toEqual([card.id, spouse.id].sort());
  });

  it("same phone in two synagogues gets separate cards and links", async () => {
    const t2 = await makeTenant("אוהל משה");
    const card2 = await makeCongregant(t2, { phone: PHONE });
    const { token } = await asTenant(t2, (t) => issuePersonalLink(t, t2, card2.id, "g"));
    const id = await login(token);
    expect(id.tenantId).toBe(t2);
    expect((await portalOverview(id)).summary.debtAgorot).toBe(0);
  });
});

describe("reminders", () => {
  beforeEach(async () => {
    await messagingAccount(tenantId);
    await asTenant(tenantId, (t) => recordConsent(t, tenantId, gabbai(), card.id, true));
  });
  const now = new Date("2026-11-02T05:00:00Z"); // Monday 07:00 Israel
  const run = async (at = now) => {
    await scanReminders(tenantId, at);
    const due = await dueMessages(tenantId, new Date(at.getTime() + 6 * 3600_000));
    const out = [];
    for (const m of due) out.push(await dispatchMessage(tenantId, m.id, new Date(at.getTime() + 6 * 3600_000)));
    return out;
  };

  it("sends one reminder at 10:00 and not again within 30 days", async () => {
    const r = await run();
    expect(r).toEqual([expect.objectContaining({ sent: true })]);
    const msgs = await asTenant(tenantId, (t) => t.outboundMessage.findMany());
    expect(msgs[0]).toMatchObject({ status: "accepted", kind: "reminder" });
    expect(msgs[0]!.scheduledFor.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(await run(new Date("2026-11-10T05:00:00Z"))).toEqual([]);
  });

  it("no reminder without consent, after opt-out, with open inquiry or pending external payment", async () => {
    await asTenant(tenantId, (t) => recordConsent(t, tenantId, gabbai(), card.id, false));
    expect(await run()).toEqual([]);
    await asTenant(tenantId, (t) => recordConsent(t, tenantId, gabbai(), card.id, true));
    await asTenant(tenantId, (t) => reportExternalPayment(t, tenantId, { type: "congregant", id: card.id }, { congregantId: card.id, amountAgorot: 100, method: "check" }));
    expect(await run()).toEqual([]);
  });

  it("paid between scheduling and sending → skipped at send time", async () => {
    await scanReminders(tenantId, now);
    const acc = await asTenant(tenantId, (t) => t.integrationAccount.create({ data: { tenantId, kind: "payment", provider: "fake", environment: "fake", externalAccountId: "p1" } }));
    await asTenant(tenantId, (t) =>
      recordVerifiedCardPayment(t, tenantId, { type: "provider", id: "x" }, { congregantId: card.id, amountAgorot: ils(300), currency: "ILS", integrationAccountId: acc.id, identity: { provider: "fake", environment: "fake", accountId: "p1", transactionId: "t1" } }),
    );
    const due = await dueMessages(tenantId, new Date("2026-11-02T09:00:00Z"));
    const res = await dispatchMessage(tenantId, due[0]!.id, new Date("2026-11-02T09:00:00Z"));
    expect(res.sent).toBe(false);
    const m = await asTenant(tenantId, (t) => t.outboundMessage.findFirstOrThrow({ where: { kind: "reminder" } }));
    expect(m).toMatchObject({ status: "skipped", skipReason: expect.stringContaining("no_debt") });
  });

  it("opt-out cancels scheduled reminders", async () => {
    await scanReminders(tenantId, now);
    const { token } = await asTenant(tenantId, (t) => issuePersonalLink(t, tenantId, card.id, "g"));
    const id = await login(token);
    await portalOptOut(id, card.id);
    expect(await dueMessages(tenantId, new Date("2026-11-03T00:00:00Z"))).toEqual([]);
  });

  it("dispatching the same message twice concurrently sends once", async () => {
    await scanReminders(tenantId, now);
    const [m] = await dueMessages(tenantId, new Date("2026-11-02T09:00:00Z"));
    const r = await Promise.all([dispatchMessage(tenantId, m!.id, new Date("2026-11-02T09:00:00Z")), dispatchMessage(tenantId, m!.id, new Date("2026-11-02T09:00:00Z"))]);
    expect(r.filter((x) => x.sent)).toHaveLength(1);
    expect(await prisma.devFakeRecord.count({ where: { kind: "message" } })).toBe(1);
  });

  it("unknown send outcome (timeout) → status unknown, task opened, never resent", async () => {
    const c = await makeCongregant(tenantId, { phone: "+972500000000", firstName: "טיים" });
    await asTenant(tenantId, (t) => createPledge(t, tenantId, gabbai(), { congregantId: c.id, amountAgorot: 100, pledgeDate: d("2026-08-01") }));
    await asTenant(tenantId, (t) => recordConsent(t, tenantId, gabbai(), c.id, true));
    await run();
    const m = await asTenant(tenantId, (t) => t.outboundMessage.findFirstOrThrow({ where: { congregantId: c.id } }));
    expect(m.status).toBe("unknown");
    await run(new Date("2026-11-03T05:00:00Z"));
    expect(await asTenant(tenantId, (t) => t.outboundMessage.count({ where: { congregantId: c.id } }))).toBe(1);
    expect(await asTenant(tenantId, (t) => t.task.count({ where: { congregantId: c.id } }))).toBe(1);
  });

  it("quota exhausted or suspended subscription → no reminder", async () => {
    await makeSubscription(tenantId, "suspended");
    expect(await run()).toEqual([]);
  });
});

describe("WhatsApp bot (fake provider)", () => {
  const inbound = (text: string, id: string, account = "wa-1", from = PHONE) => {
    const raw = JSON.stringify({ account, messages: [{ from, text, id }] });
    return receiveMessagingWebhook("fake", new Headers({ "x-fake-signature": hmacSha256("dev-messaging-secret", raw) }), raw);
  };
  beforeEach(async () => {
    await messagingAccount(tenantId);
  });

  it("balance request replies with the balance and a personal link; duplicate delivery replies once", async () => {
    const r = await inbound("1", "m1");
    if (r.outcome !== "accepted") throw new Error(r.outcome);
    const replies = await processMessagingEvent(tenantId, r.eventId);
    expect(replies).toHaveLength(1);
    expect((await inbound("1", "m1")).outcome).toBe("duplicate");
    const msg = await asTenant(tenantId, (t) => t.outboundMessage.findFirstOrThrow({ where: { kind: "menu_reply" } }));
    expect((msg.body as { text: string }).text).toContain("300 ₪");
  });

  it("'paid another way' and 'inquiry' open tasks that pause reminders; 'הסר' opts out", async () => {
    for (const [text, id] of [["3", "a"], ["4", "b"], ["הסר", "c"]] as const) {
      const r = await inbound(text, id);
      if (r.outcome === "accepted") await processMessagingEvent(tenantId, r.eventId);
    }
    const tasks = await asTenant(tenantId, (t) => t.task.findMany({ where: { congregantId: card.id } }));
    expect(tasks.map((t) => t.kind).sort()).toEqual(["external_payment", "inquiry"]);
    const c = await asTenant(tenantId, (t) => t.congregant.findUniqueOrThrow({ where: { id: card.id } }));
    expect(c.messagingOptOut).toBe(true);
  });

  it("routes by the synagogue's WhatsApp account: same phone in two synagogues stays separate", async () => {
    const t2 = await makeTenant("שני");
    await makeCongregant(t2, { phone: PHONE });
    await messagingAccount(t2, "wa-2");
    const r = await inbound("1", "x", "wa-2");
    if (r.outcome !== "accepted") throw new Error();
    expect(r.tenantId).toBe(t2);
    await processMessagingEvent(t2, r.eventId);
    const msg = await asTenant(t2, (t) => t.outboundMessage.findFirstOrThrow());
    expect((msg.body as { text: string }).text).toContain("אין לך חוב פתוח בשני");
    expect(await asTenant(tenantId, (t) => t.outboundMessage.count())).toBe(0);
  });

  it("bad signature is rejected; unknown account is unrouted", async () => {
    const raw = JSON.stringify({ account: "wa-1", messages: [{ from: PHONE, text: "1", id: "z" }] });
    expect((await receiveMessagingWebhook("fake", new Headers({ "x-fake-signature": "bad" }), raw)).outcome).toBe("rejected");
    expect((await inbound("1", "q", "nope")).outcome).toBe("unrouted");
  });
});
