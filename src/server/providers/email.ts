import { fakePut } from "./fake-store";
import { fakeAllowed } from "./guard";

// Transactional email (account verification, password reset). Resend is used when RESEND_API_KEY is set;
// otherwise, outside production, messages go to the development inbox (/dev/inbox).
export type Email = { to: string; subject: string; text: string; url?: string };

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
  if (!fakeAllowed()) throw new Error("email delivery provider is not configured");
  await fakePut("email", `${msg.to}:${Date.now()}`, { to: msg.to, subject: msg.subject, url: msg.url ?? "" });
}
