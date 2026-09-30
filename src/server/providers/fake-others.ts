import { randomUUID } from "node:crypto";
import type { IdentityDeliveryProvider, MessagingProvider, ReceiptProvider, SaaSBillingProvider } from "./types";
import { fakeList, fakePut } from "./fake-store";
import { hmacSha256, safeEqual } from "../crypto";

// Fake messaging: messages are stored and visible in /dev/inbox. Inbound messages are simulated there too.
// A recipient phone ending in "0000" simulates a timeout (unknown delivery state).
export const fakeMessagingProvider: MessagingProvider = {
  name: "fake",
  async send(account, msg) {
    const existing = (await fakeList<{ idempotencyKey: string; id: string }>("message", 2000)).find(
      (m) => m.idempotencyKey === msg.idempotencyKey,
    );
    if (existing) return { status: "accepted", providerMessageId: existing.id }; // provider-side dedupe
    if (msg.to.endsWith("0000")) return { status: "unknown", error: "timeout" };
    const id = `fmsg_${randomUUID()}`;
    await fakePut("message", id, { id, from: account.externalAccountId, tenantId: account.tenantId, ...msg } as never);
    return { status: "accepted", providerMessageId: id };
  },
  authenticateWebhook(headers, rawBody) {
    const sig = headers.get("x-fake-signature");
    const secret = process.env.FAKE_MESSAGING_WEBHOOK_SECRET ?? "dev-messaging-secret";
    return !!sig && safeEqual(sig, hmacSha256(secret, rawBody));
  },
  routeWebhook(rawBody) {
    try {
      const b = JSON.parse(rawBody) as { account?: string };
      return typeof b.account === "string" ? { externalAccountId: b.account } : null;
    } catch {
      return null;
    }
  },
  parseWebhook(rawBody) {
    const b = JSON.parse(rawBody) as {
      account: string;
      messages?: { from: string; text: string; id: string }[];
      statuses?: { id: string; status: "delivered" | "read" | "failed" | "sent" }[];
    };
    return {
      messages: (b.messages ?? []).map((m) => ({ externalAccountId: b.account, from: m.from, text: m.text, providerMessageId: m.id, at: new Date() })),
      statuses: (b.statuses ?? []).map((s) => ({ externalAccountId: b.account, providerMessageId: s.id, status: s.status })),
    };
  },
};

export const fakeIdentityProvider: IdentityDeliveryProvider = {
  name: "fake",
  async sendCode({ tenantId, phone, code }) {
    await fakePut("otp", `${phone}:${Date.now()}`, { tenantId, phone, code });
  },
};

export const fakeReceiptProvider: ReceiptProvider = {
  name: "fake",
  async issueReceipt({ paymentId, tenantId }) {
    if (process.env.FAKE_RECEIPT_FAIL === "true") throw new Error("fake receipt service unavailable");
    const documentNumber = `FAKE-${paymentId.slice(0, 8)}`;
    await fakePut("receipt", paymentId, { tenantId, documentNumber });
    return { documentNumber };
  },
};

export const fakeSaaSBillingProvider: SaaSBillingProvider = {
  name: "fake",
  async chargeInvoice({ invoiceId, amountAgorot }) {
    const chargeId = `fchg_${invoiceId}`;
    if (process.env.FAKE_SAAS_CHARGE_FAIL === "true") return { status: "failed", chargeId, error: "card declined (fake)" };
    await fakePut("saas_charge", chargeId, { invoiceId, amountAgorot });
    return { status: "succeeded", chargeId };
  },
};
