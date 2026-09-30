import type { IdentityDeliveryProvider } from "./types";

/**
 * Verification codes by SMS through Twilio's Messages API (OTP_CHANNEL=sms).
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either TWILIO_MESSAGING_SERVICE_SID (recommended) or
 * TWILIO_FROM (a Twilio number or an approved alphanumeric sender ID, e.g. "Nedarim").
 * The code itself is generated, hashed and rate-limited by the app; Twilio only delivers it.
 */
export const twilioSmsProvider: IdentityDeliveryProvider = {
  name: "sms",
  async sendCode({ phone, code }) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const from = process.env.TWILIO_FROM;
    if (!sid || !token || (!service && !from)) throw new Error("SMS provider (Twilio) is not configured");
    const form = new URLSearchParams({ To: phone, Body: `קוד האימות שלך: ${code}\nהקוד תקף ל-10 דקות. אין למסור אותו לאף אחד.` });
    if (service) form.set("MessagingServiceSid", service);
    else form.set("From", from!);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      // Never log the code or the phone number.
      throw new Error(`SMS not sent (Twilio ${res.status}${err.code ? ` / ${err.code}` : ""})`);
    }
  },
};
