import { randomUUID } from "node:crypto";
import type { CallbackRouting, CreatePageInput, IntegrationRef, PaymentProvider, VerifiedTransaction } from "./types";
import { fakeGet, fakeList, fakePut } from "./fake-store";
import { hmacSha256, safeEqual } from "../crypto";
import { assertFakeAllowed } from "./guard";

export type FakePage = CreatePageInput & { accountId: string; pageRef: string; status: "open" | "done"; expiresAt: string };
export type FakeTxn = {
  transactionId: string;
  pageRef: string | null;
  accountId: string;
  operation: "charge" | "refund";
  status: VerifiedTransaction["status"];
  amountAgorot: number;
  currency: string;
  originalTransactionId?: string | null;
  occurredAt: string;
};

export const FAKE_SIGNATURE_HEADER = "x-fake-signature";

/** Fake payment provider. The callback carries only routing hints; truth comes from fetchTransaction. */
export const fakePaymentProvider: PaymentProvider = {
  name: "fake",
  async createPaymentPage(account, input) {
    assertFakeAllowed();
    const pageRef = `fpg_${randomUUID()}`;
    await fakePut("payment_page", pageRef, {
      ...input,
      expiresAt: input.expiresAt.toISOString(),
      accountId: account.externalAccountId,
      pageRef,
      status: "open",
    } as never);
    return { pageRef, paymentUrl: `${process.env.APP_BASE_URL}/dev/fake-checkout/${pageRef}` };
  },
  routeCallback(rawBody): CallbackRouting | null {
    try {
      const b = JSON.parse(rawBody) as { account?: string; page_ref?: string; transaction_id?: string };
      if (typeof b.account !== "string") return null;
      return { externalAccountId: b.account, pageRef: b.page_ref ?? null, transactionId: b.transaction_id ?? null };
    } catch {
      return null;
    }
  },
  authenticateCallback(account, headers, rawBody) {
    const sig = headers.get(FAKE_SIGNATURE_HEADER);
    const secret = account.secrets.webhookSecret;
    if (!sig || !secret) return false;
    return safeEqual(sig, hmacSha256(secret, rawBody));
  },
  async fetchTransaction(account, ref) {
    const all = await fakeList<FakeTxn>("payment_txn", 1000);
    return all
      .filter((t) => t.accountId === account.externalAccountId)
      .filter(
        (t) =>
          (ref.transactionId && (t.transactionId === ref.transactionId || t.originalTransactionId === ref.transactionId)) ||
          (ref.pageRef && t.pageRef === ref.pageRef),
      )
      .map(toVerified);
  },
  async listTransactions(account, from, to) {
    const all = await fakeList<FakeTxn>("payment_txn", 5000);
    return all
      .filter((t) => t.accountId === account.externalAccountId)
      .filter((t) => new Date(t.occurredAt) >= from && new Date(t.occurredAt) < to)
      .map(toVerified);
  },
};

const toVerified = (t: FakeTxn): VerifiedTransaction => ({ ...t, occurredAt: new Date(t.occurredAt) });

// ───────── simulation helpers used by the dev checkout page and by tests ─────────

export type FakeOutcome = "charged" | "authorized_only" | "failed" | "card_check";

export async function fakeCompleteCheckout(pageRef: string, outcome: FakeOutcome, opts: { amountAgorot?: number } = {}) {
  assertFakeAllowed();
  const page = await fakeGet<FakePage>("payment_page", pageRef);
  if (!page) throw new Error("unknown fake page");
  const txn: FakeTxn = {
    transactionId: `ftx_${randomUUID()}`,
    pageRef,
    accountId: page.accountId,
    operation: "charge",
    status: outcome,
    amountAgorot: opts.amountAgorot ?? page.amountAgorot,
    currency: "ILS",
    occurredAt: new Date().toISOString(),
  };
  await fakePut("payment_txn", txn.transactionId, txn);
  if (outcome === "charged") await fakePut("payment_page", pageRef, { ...page, status: "done" } as never);
  return { txn, page };
}

export async function fakeRefund(accountId: string, originalTransactionId: string, amountAgorot: number) {
  assertFakeAllowed();
  const txn: FakeTxn = {
    transactionId: `frf_${randomUUID()}`,
    pageRef: null,
    accountId,
    operation: "refund",
    status: "refunded",
    amountAgorot,
    currency: "ILS",
    originalTransactionId,
    occurredAt: new Date().toISOString(),
  };
  await fakePut("payment_txn", txn.transactionId, txn);
  return txn;
}

/** Builds the (signed) callback the fake provider would POST. */
export function fakeCallback(account: IntegrationRef, body: Record<string, unknown>) {
  const raw = JSON.stringify({ account: account.externalAccountId, ...body });
  return { raw, signature: hmacSha256(account.secrets.webhookSecret ?? "", raw) };
}
