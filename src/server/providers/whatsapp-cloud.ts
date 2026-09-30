import type { MessagingProvider } from "./types";
import { hmacSha256, safeEqual } from "../crypto";

/*
 * WhatsApp Business Cloud API adapter.
 * NOT ENABLED: live messaging stays off until the owner decides how pledge reminders fit Meta's
 * policy (utility template approval) and each synagogue's number is onboarded. See docs/PROVIDER_SETUP.md.
 * Field names follow the public Cloud API webhook format; verify against current Meta docs before enabling.
 * The Cloud API has no idempotency key on send: on timeout we record "unknown" and never resend blindly.
 */
export const whatsappCloudProvider: MessagingProvider = {
  name: "whatsapp_cloud",
  async send(account, msg) {
    if (process.env.WHATSAPP_LIVE_ENABLED !== "true") return { status: "rejected", error: "live WhatsApp disabled" };
    const base = process.env.WHATSAPP_API_BASE;
    const body = msg.template
      ? {
          messaging_product: "whatsapp",
          to: msg.to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: msg.template.name,
            language: { code: msg.template.language },
            components: [
              { type: "body", parameters: msg.template.params.map((text) => ({ type: "text", text })) },
              // Authentication templates carry the code again on the copy-code button (verify against Meta docs).
              ...(msg.idempotencyKey.startsWith("otp:")
                ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: msg.template.params[0] ?? "" }] }]
                : []),
            ],
          },
        }
      : { messaging_product: "whatsapp", to: msg.to.replace(/^\+/, ""), type: "text", text: { body: msg.text } };
    try {
      const res = await fetch(`${base}/${account.externalAccountId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${account.secrets.accessToken}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
      if (res.ok && json.messages?.[0]?.id) return { status: "accepted", providerMessageId: json.messages[0].id };
      if (res.status >= 500) return { status: "unknown", error: `HTTP ${res.status}` };
      return { status: "rejected", error: json.error?.message ?? `HTTP ${res.status}` };
    } catch (e) {
      return { status: "unknown", error: (e as Error).name };
    }
  },
  authenticateWebhook(headers, rawBody) {
    const sig = headers.get("x-hub-signature-256");
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!sig || !secret) return false;
    return safeEqual(sig, `sha256=${hmacSha256(secret, rawBody)}`);
  },
  routeWebhook(rawBody) {
    try {
      const b = JSON.parse(rawBody) as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[] };
      const id = b.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      return id ? { externalAccountId: id } : null;
    } catch {
      return null;
    }
  },
  parseWebhook(rawBody) {
    type V = {
      metadata?: { phone_number_id?: string };
      messages?: { from: string; id: string; timestamp: string; text?: { body?: string }; interactive?: { button_reply?: { id: string }; list_reply?: { id: string } } }[];
      statuses?: { id: string; status: string }[];
    };
    const b = JSON.parse(rawBody) as { entry?: { changes?: { value?: V }[] }[] };
    const out = { messages: [] as ReturnType<MessagingProvider["parseWebhook"]>["messages"], statuses: [] as ReturnType<MessagingProvider["parseWebhook"]>["statuses"] };
    for (const e of b.entry ?? [])
      for (const c of e.changes ?? []) {
        const v = c.value;
        const acct = v?.metadata?.phone_number_id ?? "";
        for (const m of v?.messages ?? [])
          out.messages.push({
            externalAccountId: acct,
            from: `+${m.from}`,
            text: m.text?.body ?? m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? "",
            providerMessageId: m.id,
            at: new Date(Number(m.timestamp) * 1000),
          });
        for (const s of v?.statuses ?? [])
          if (["sent", "delivered", "read", "failed"].includes(s.status))
            out.statuses.push({ externalAccountId: acct, providerMessageId: s.id, status: s.status as "sent" });
      }
    return out;
  },
};
