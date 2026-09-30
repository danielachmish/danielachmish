import { randomDigits } from "../crypto";
import type { Tx } from "../db/client";
import type { Actor } from "../db/context";
import { DomainError } from "../errors";
import { connectIntegration } from "./connect";

/*
 * WhatsApp Business "Embedded Signup": the synagogue logs in with Facebook inside our page, creates/chooses its
 * own WhatsApp Business account and number, and we receive a code + the WABA id + the phone number id.
 * The platform is a Meta "Tech Provider"; each synagogue owns its account, number, display name and billing.
 *
 * Steps after the popup (per Meta's Embedded Signup flow – verify against current docs before going live):
 *   1. exchange the code for a business token (app id + app secret)
 *   2. subscribe our app to the synagogue's WABA webhooks
 *   3. register the phone number for Cloud API (with a 6-digit two-step PIN we keep encrypted)
 *   4. create the message templates we use (reminder, payment confirmation, verification code)
 * Env: META_APP_ID, META_APP_SECRET, META_ES_CONFIG_ID, WHATSAPP_API_BASE (e.g. https://graph.facebook.com/v23.0).
 */

export function embeddedSignupConfig() {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_ES_CONFIG_ID;
  if (!appId || !configId || !process.env.META_APP_SECRET) return null;
  const base = process.env.WHATSAPP_API_BASE ?? "https://graph.facebook.com/v23.0";
  const version = /\/(v\d+\.\d+)/.exec(base)?.[1] ?? "v23.0";
  return { appId, configId, version };
}

const base = () => (process.env.WHATSAPP_API_BASE ?? "https://graph.facebook.com/v23.0").replace(/\/$/, "");

async function graph<T>(path: string, init: { method?: string; token?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(`${base()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    const e = new Error(`Meta API ${res.status}${json.error?.code ? `/${json.error.code}` : ""}: ${json.error?.message ?? "error"}`);
    (e as Error & { status?: number; metaCode?: number }).status = res.status;
    (e as Error & { metaCode?: number }).metaCode = json.error?.code;
    throw e;
  }
  return json;
}

/** Templates every synagogue's account needs. Names are referenced by the sender (see reminders/service.ts). */
export const TEMPLATES = [
  {
    name: "pledge_reminder",
    category: "UTILITY",
    language: "he",
    components: [
      {
        type: "BODY",
        text: "שלום {{1}}, תזכורת מ{{2}}: היתרה הפתוחה שלך היא {{3}}. לצפייה ולתשלום מאובטח: {{4}}\nלהפסקת תזכורות השיבו הסר.",
        example: { body_text: [["ישראל", "בית הכנסת", "180 ₪", "https://example.org/p#abc"]] },
      },
    ],
  },
  {
    name: "payment_confirmation",
    category: "UTILITY",
    language: "he",
    components: [{ type: "BODY", text: "התקבל תשלום של {{1}} ל{{2}}. תודה רבה!", example: { body_text: [["180 ₪", "בית הכנסת"]] } }],
  },
  {
    name: "otp_code",
    category: "AUTHENTICATION",
    language: "he",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
    ],
  },
] as const;

/** Creates missing templates; an existing template with the same name is left as is. */
export async function ensureTemplates(wabaId: string, token: string) {
  const results: { name: string; outcome: "created" | "exists" | "failed"; error?: string }[] = [];
  for (const t of TEMPLATES) {
    try {
      await graph(`${wabaId}/message_templates`, { method: "POST", token, body: t });
      results.push({ name: t.name, outcome: "created" });
    } catch (e) {
      const msg = (e as Error).message;
      if (/already exists|duplicate|2388023|2388024/i.test(msg)) results.push({ name: t.name, outcome: "exists" });
      else results.push({ name: t.name, outcome: "failed", error: msg.slice(0, 200) });
    }
  }
  return results;
}

export type SignupResult = { code: string; wabaId: string; phoneNumberId: string };

/** Network steps (outside any DB transaction). Returns what must be stored. */
export async function finishEmbeddedSignup(input: SignupResult) {
  const cfg = embeddedSignupConfig();
  if (!cfg) throw new DomainError("signup_not_configured", "החיבור בלחיצה עדיין לא הוגדר במערכת (חסרים פרטי אפליקציית Meta).", 409);
  if (!/^\d{5,25}$/.test(input.wabaId) || !/^\d{5,25}$/.test(input.phoneNumberId) || !input.code)
    throw new DomainError("signup_bad_data", "החיבור לא הושלם. נסו שוב.");
  const tok = await graph<{ access_token: string }>("oauth/access_token", {
    query: { client_id: cfg.appId, client_secret: process.env.META_APP_SECRET!, code: input.code },
  });
  const token = tok.access_token;
  await graph(`${input.wabaId}/subscribed_apps`, { method: "POST", token });
  const pin = randomDigits(6);
  try {
    await graph(`${input.phoneNumberId}/register`, { method: "POST", token, body: { messaging_product: "whatsapp", pin } });
  } catch (e) {
    // A number that is already registered (e.g. re-connecting) is fine.
    if (!/already registered|133005|133015/i.test((e as Error).message)) throw e;
  }
  const templates = await ensureTemplates(input.wabaId, token);
  return { token, pin, templates };
}

export async function storeWhatsappConnection(
  tx: Tx,
  tenantId: string,
  actor: Actor,
  input: SignupResult & { token: string; pin: string; displayName?: string },
) {
  return connectIntegration(tx, tenantId, actor, {
    kind: "messaging",
    provider: "whatsapp_cloud",
    externalAccountId: input.phoneNumberId,
    displayName: input.displayName,
    secrets: { accessToken: input.token },
    extraSecrets: { wabaId: input.wabaId, pin: input.pin },
    confirmReplace: true,
  });
}
