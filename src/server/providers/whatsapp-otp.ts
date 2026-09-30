import type { IdentityDeliveryProvider } from "./types";
import { systemCtx, withContext } from "../db/context";
import { messagingProvider, toIntegrationRef } from "./registry";

/**
 * OTP through the synagogue's own WhatsApp account (OTP_CHANNEL=whatsapp) – no separate SMS provider.
 * With the Cloud API this uses an approved AUTHENTICATION template (name in WHATSAPP_OTP_TEMPLATE,
 * default "otp_code"): body parameter = code, copy-code button parameter = code. Verify the template
 * format against Meta's current docs before going live. With the fake messaging provider (dev/demo)
 * the code appears in /dev/inbox.
 */
export const whatsappIdentityProvider: IdentityDeliveryProvider = {
  name: "whatsapp",
  async sendCode({ tenantId, phone, code }) {
    const integration = await withContext(systemCtx(tenantId), (tx) =>
      tx.integrationAccount.findFirst({ where: { kind: "messaging", status: "active" } }),
    );
    if (!integration) throw new Error("synagogue has no active WhatsApp connection for verification codes");
    const provider = messagingProvider(integration.provider);
    const r = await provider.send(toIntegrationRef(integration), {
      to: phone,
      idempotencyKey: `otp:${phone}:${code}`,
      template: { name: process.env.WHATSAPP_OTP_TEMPLATE ?? "otp_code", language: "he", params: [code] },
      text: `קוד האימות שלך: ${code}. הקוד תקף ל-10 דקות. אין למסור אותו לאף אחד.`,
    });
    if (r.status !== "accepted") throw new Error(`verification code was not sent (${r.status})`);
  },
};
