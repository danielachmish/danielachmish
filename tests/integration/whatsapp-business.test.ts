import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asTenant, d, gabbai, makeCongregant, makeSubscription, makeTenant, truncateAll } from "./helpers";
import { createPledge } from "@/server/ledger/engine";
import { recordConsent } from "@/server/gabbai/congregants";
import { finishEmbeddedSignup, storeWhatsappConnection, TEMPLATES } from "@/server/integrations/whatsapp-signup";
import { sendReminderNow } from "@/server/reminders/service";
import { shareReminderViaWhatsApp } from "@/server/reminders/share";
import { setOptOut } from "@/server/portal/actions";
import { tenantCtx } from "@/server/db/context";
import { randomUUID } from "node:crypto";

process.env.QUEUE_DISABLED = "true";
const saved = { ...process.env };
let tenantId: string;
let cardId: string;
type Call = { url: string; method: string; body: unknown; auth: string };
let calls: Call[];

function stubMeta(responses: Record<string, { status?: number; json: unknown }> = {}) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : null, auth: (init.headers as Record<string, string> | undefined)?.authorization ?? "" });
    const key = Object.keys(responses).find((k) => u.includes(k));
    const r = key ? responses[key]! : { json: { success: true, messages: [{ id: "wamid.1" }] } };
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  });
}

beforeEach(async () => {
  await truncateAll();
  process.env = { ...saved, META_APP_ID: "123", META_APP_SECRET: "sec", META_ES_CONFIG_ID: "cfg", MESSAGING_MODE: "sandbox", WHATSAPP_API_BASE: "https://graph.facebook.com/v23.0" };
  tenantId = await makeTenant("אוהל יעקב");
  await makeSubscription(tenantId);
  cardId = (await makeCongregant(tenantId, { phone: "+972501231234", firstName: "משה" })).id;
  await asTenant(tenantId, (tx) => createPledge(tx, tenantId, gabbai(), { congregantId: cardId, amountAgorot: 18000, pledgeDate: d("2026-08-01") }));
  await asTenant(tenantId, (tx) => recordConsent(tx, tenantId, gabbai(), cardId, true));
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...saved };
});

describe("WhatsApp Business one-click connection (Embedded Signup)", () => {
  it("exchanges the code, subscribes the app, registers the number and creates the templates", async () => {
    stubMeta({ "oauth/access_token": { json: { access_token: "BIZ_TOKEN" } } });
    const r = await finishEmbeddedSignup({ code: "CODE", wabaId: "1111111", phoneNumberId: "2222222" });
    expect(r.token).toBe("BIZ_TOKEN");
    expect(calls[0]!.url).toContain("oauth/access_token?client_id=123&client_secret=sec&code=CODE");
    expect(calls[1]).toMatchObject({ method: "POST", auth: "Bearer BIZ_TOKEN" });
    expect(calls[1]!.url).toContain("/1111111/subscribed_apps");
    expect(calls[2]!.url).toContain("/2222222/register");
    expect((calls[2]!.body as { pin: string }).pin).toMatch(/^\d{6}$/);
    expect(calls.slice(3).map((c) => (c.body as { name: string }).name)).toEqual(TEMPLATES.map((t) => t.name));
    expect(r.templates.every((t) => t.outcome === "created")).toBe(true);
  });

  it("already-registered number and existing templates are fine", async () => {
    stubMeta({
      "oauth/access_token": { json: { access_token: "T" } },
      "/register": { status: 400, json: { error: { code: 133005, message: "already registered" } } },
      message_templates: { status: 400, json: { error: { code: 2388024, message: "Content in this language already exists" } } },
    });
    const r = await finishEmbeddedSignup({ code: "C", wabaId: "1111111", phoneNumberId: "2222222" });
    expect(r.templates.every((t) => t.outcome === "exists")).toBe(true);
  });

  it("reminders then go out as the approved template with the real link; history keeps no link", async () => {
    stubMeta();
    await asTenant(tenantId, (tx) => storeWhatsappConnection(tx, tenantId, gabbai(), { code: "x", wabaId: "1111111", phoneNumberId: "2222222", token: "BIZ", pin: "123456" }));
    const r = await sendReminderNow(tenantCtx(tenantId, gabbai(), "g") as never, { congregantId: cardId, overrideSoft: false, clientOpId: randomUUID(), requestedBy: "g" });
    expect(r.status).toBe("sent");
    const send = calls.find((c) => c.url.endsWith("/2222222/messages"))!;
    const tpl = (send.body as { template: { name: string; components: { parameters: { text: string }[] }[] } }).template;
    expect(tpl.name).toBe("pledge_reminder");
    expect(tpl.components[0]!.parameters.map((p) => p.text).slice(0, 3)).toEqual(["משה", "אוהל יעקב", "180 ₪"]);
    expect(tpl.components[0]!.parameters[3]!.text).toMatch(/\/p#[A-Za-z0-9_-]{20,}$/);
    expect(send.auth).toBe("Bearer BIZ");
    const stored = await asTenant(tenantId, (tx) => tx.outboundMessage.findFirstOrThrow({ where: { kind: "reminder" } }));
    expect(JSON.stringify(stored.body)).not.toContain("/p#");
  });
});

describe("send from my WhatsApp (wa.me)", () => {
  it("returns a wa.me link with the ready text and records a hand-off without the link", async () => {
    const { url } = await shareReminderViaWhatsApp(tenantCtx(tenantId, gabbai(), "g") as never, cardId, "g");
    expect(url).toMatch(/^https:\/\/wa\.me\/972501231234\?text=/);
    const text = decodeURIComponent(url.split("text=")[1]!);
    expect(text).toContain("180 ₪");
    expect(text).toMatch(/\/p#[A-Za-z0-9_-]{20,}/);
    const m = await asTenant(tenantId, (tx) => tx.outboundMessage.findFirstOrThrow());
    expect(m).toMatchObject({ trigger: "manual_share", status: "handed_off" });
    expect(JSON.stringify(m.body)).not.toContain("/p#");
  });

  it("refuses when the congregant asked to stop messages", async () => {
    await asTenant(tenantId, (tx) => setOptOut(tx, tenantId, cardId, "test", "congregant"));
    await expect(shareReminderViaWhatsApp(tenantCtx(tenantId, gabbai(), "g") as never, cardId, "g")).rejects.toMatchObject({ code: "share_blocked" });
  });
});
