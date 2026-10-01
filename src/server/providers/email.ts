import { fakePut } from "./fake-store";
import { fakeAllowed } from "./guard";
import type { IdentityDeliveryProvider } from "./types";
import { DomainError } from "../errors";

export const EMAIL_NOT_CONFIGURED = "שליחת דוא״ל עוד לא הוגדרה במערכת (RESEND_API_KEY ו-EMAIL_FROM). אחרי ההגדרה אפשר לנסות שוב.";

// Transactional email (account verification, password reset). Resend is used when RESEND_API_KEY is set;
// otherwise, outside production, messages go to the development inbox (/dev/inbox).
export type Email = { to: string; subject: string; text: string; url?: string; code?: string };

/** Real delivery (Resend) or, outside production, the development inbox. */
export const emailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) || fakeAllowed();

export async function sendEmail(msg: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const from = process.env.EMAIL_FROM;
    if (!from) throw new Error("EMAIL_FROM is not configured");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`email provider HTTP ${res.status}`);
    return;
  }
  if (!fakeAllowed()) throw new DomainError("email_not_configured", EMAIL_NOT_CONFIGURED, 503);
  await fakePut("email", `${msg.to}:${Date.now()}`, { to: msg.to, subject: msg.subject, url: msg.url ?? "", code: msg.code ?? "" });
}

/** One-time codes by e-mail to the address on the congregant's card (free alternative to SMS). */
export const emailIdentityProvider: IdentityDeliveryProvider = {
  name: "email",
  async sendCode({ email, code, synagogueName }) {
    if (!email) throw new Error("card has no e-mail address for verification codes");
    await sendEmail({
      to: email,
      subject: `קוד כניסה: ${code}`,
      code,
      text: `קוד הכניסה שלך${synagogueName ? ` ל${synagogueName}` : ""}: ${code}\n\nהקוד בתוקף ל-10 דקות. אם לא ביקשת קוד, אפשר להתעלם מהודעה זו.`,
    });
  },
};
