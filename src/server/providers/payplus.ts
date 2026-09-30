import type { IntegrationRef, PaymentProvider, VerifiedTransaction } from "./types";
import { hmacSha256, safeEqual } from "../crypto";

/*
 * PayPlus adapter – NOT VERIFIED AGAINST THE OFFICIAL DOCUMENTATION.
 *
 * The development environment could not reach docs.payplus.co.il, so endpoint paths, field names,
 * status codes and the callback signature scheme below are placeholders based on the public shape of
 * the API and MUST be confirmed (see docs/PROVIDER_SETUP.md, "PayPlus – items to verify").
 * The adapter refuses to run until PAYPLUS_CONTRACT_VERIFIED=true is set by whoever verified it.
 *
 * Safety design that does not depend on those details:
 *   - The callback is treated only as a trigger. Before any ledger change, the worker performs a
 *     server-to-server status query (fetchTransaction) with the synagogue's own API credentials and
 *     validates account, request reference, amount, currency and operation type.
 */

function assertVerified() {
  if (process.env.PAYPLUS_CONTRACT_VERIFIED !== "true")
    throw new Error("PayPlus adapter contract has not been verified against the official docs");
}

function base() {
  const b = process.env.PAYPLUS_API_BASE;
  if (!b) throw new Error("PAYPLUS_API_BASE not configured");
  return b;
}

async function call<T>(account: IntegrationRef, path: string, body: unknown): Promise<T> {
  assertVerified();
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // TODO(verify): PayPlus authorization header format.
      authorization: JSON.stringify({ api_key: account.secrets.apiKey, secret_key: account.secrets.secretKey }),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`PayPlus HTTP ${res.status}`);
  return (await res.json()) as T;
}

// TODO(verify): mapping of PayPlus status codes / transaction types to our statuses.
function mapStatus(t: Record<string, unknown>): VerifiedTransaction["status"] {
  const code = String(t.status_code ?? "");
  const type = String(t.type ?? "").toLowerCase();
  if (type.includes("approval") || type.includes("j5")) return "authorized_only";
  if (type.includes("check")) return "card_check";
  if (code === "000") return type.includes("refund") ? "refunded" : "charged";
  return "failed";
}

export const payplusProvider: PaymentProvider = {
  name: "payplus",
  async createPaymentPage(account, input) {
    // TODO(verify): endpoint and field names.
    const r = await call<{ data?: { page_request_uid?: string; payment_page_link?: string } }>(account, "/PaymentPages/generateLink", {
      payment_page_uid: account.secrets.paymentPageUid,
      amount: input.amountAgorot / 100,
      currency_code: input.currency,
      more_info: input.requestId,
      refURL_success: input.successUrl,
      refURL_failure: input.failureUrl,
      refURL_callback: input.callbackUrl,
      customer: { customer_name: input.payer.name, phone: input.payer.phone ?? undefined },
    });
    const pageRef = r.data?.page_request_uid;
    const url = r.data?.payment_page_link;
    if (!pageRef || !url) throw new Error("PayPlus: unexpected generateLink response");
    if (!/^https:\/\/([a-z0-9-]+\.)*payplus\.co\.il\//i.test(url)) throw new Error("PayPlus: unexpected payment URL host");
    return { pageRef, paymentUrl: url };
  },
  routeCallback(rawBody) {
    try {
      const b = JSON.parse(rawBody) as { transaction?: Record<string, unknown> } & Record<string, unknown>;
      const t = (b.transaction ?? b) as Record<string, unknown>;
      // TODO(verify): which field identifies the receiving terminal.
      const acct = t.terminal_uid ?? b.terminal_uid;
      if (typeof acct !== "string") return null;
      return {
        externalAccountId: acct,
        pageRef: typeof t.payment_page_request_uid === "string" ? t.payment_page_request_uid : null,
        transactionId: typeof t.uid === "string" ? t.uid : null,
      };
    } catch {
      return null;
    }
  },
  authenticateCallback(account, headers, rawBody) {
    // TODO(verify) per "Validate Requests Received from PayPlus": header name, HMAC input and encoding.
    const provided = headers.get("hash");
    if (!provided || !account.secrets.secretKey) return false;
    return safeEqual(provided, hmacSha256(account.secrets.secretKey, rawBody, "base64"));
  },
  async fetchTransaction(account, ref) {
    // TODO(verify): IPN / status query endpoint.
    const r = await call<{ data?: Record<string, unknown> }>(account, "/PaymentPages/ipn", {
      payment_request_uid: ref.pageRef ?? undefined,
      transaction_uid: ref.transactionId ?? undefined,
    });
    const t = r.data;
    if (!t) return [];
    return [
      {
        transactionId: String(t.transaction_uid ?? t.uid ?? ""),
        pageRef: (t.page_request_uid as string) ?? ref.pageRef ?? null,
        accountId: String(t.terminal_uid ?? ""),
        operation: String(t.type ?? "").toLowerCase().includes("refund") ? "refund" : "charge",
        status: mapStatus(t),
        amountAgorot: Math.round(Number(String(t.amount ?? "0")) * 100),
        currency: String(t.currency_code ?? t.currency ?? ""),
        occurredAt: new Date(String(t.date ?? new Date().toISOString())),
      },
    ];
  },
  async listTransactions() {
    // Unknown whether a listing API is available for our account type – reconciliation falls back to CSV import.
    return null;
  },
};
