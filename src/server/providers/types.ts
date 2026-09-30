// Provider contracts. Each concern is a separate interface so they can be swapped independently.
// Implementations: fake (dev/test only), payplus (payments), whatsapp_cloud (messaging).

export type IntegrationRef = {
  id: string;
  tenantId: string;
  provider: string;
  environment: "fake" | "sandbox" | "live";
  externalAccountId: string;
  secrets: Record<string, string>;
};

// ───────── payments ─────────

export type CreatePageInput = {
  requestId: string;
  amountAgorot: number;
  currency: "ILS";
  description: string;
  payer: { name: string; phone?: string | null };
  callbackUrl: string;
  successUrl: string;
  failureUrl: string;
  expiresAt: Date;
};

/** Normalised, server-verified view of a provider transaction. Only "charged" reduces debt. */
export type VerifiedTransaction = {
  transactionId: string;
  pageRef: string | null;
  accountId: string; // receiving terminal / account as reported by the provider API
  operation: "charge" | "refund";
  status: "charged" | "authorized_only" | "card_check" | "failed" | "pending" | "refunded";
  amountAgorot: number;
  currency: string;
  originalTransactionId?: string | null; // for refunds
  occurredAt: Date;
};

export type CallbackRouting = { externalAccountId: string; pageRef?: string | null; transactionId?: string | null };

export interface PaymentProvider {
  readonly name: string;
  createPaymentPage(account: IntegrationRef, input: CreatePageInput): Promise<{ pageRef: string; paymentUrl: string }>;
  /** Extracts only routing hints from an untrusted body. Nothing here is trusted for money. */
  routeCallback(rawBody: string): CallbackRouting | null;
  /** Documented authentication of the callback (signature). */
  authenticateCallback(account: IntegrationRef, headers: Headers, rawBody: string): boolean;
  /** Server-to-server query – the source of truth before any ledger change. */
  fetchTransaction(account: IntegrationRef, ref: { pageRef?: string | null; transactionId?: string | null }): Promise<VerifiedTransaction[]>;
  /** For daily reconciliation. Returns null if the provider offers no listing API (then use import). */
  listTransactions(account: IntegrationRef, from: Date, to: Date): Promise<VerifiedTransaction[] | null>;
}

// ───────── messaging ─────────

export type OutboundMessageInput = {
  to: string;
  idempotencyKey: string;
  template?: { name: string; language: string; params: string[] };
  text?: string;
};
export type SendResult =
  | { status: "accepted"; providerMessageId: string }
  | { status: "rejected"; error: string }
  | { status: "unknown"; error: string }; // timeout / network – delivery state unknown, never blindly retried

export type InboundMessage = { externalAccountId: string; from: string; text: string; providerMessageId: string; at: Date };
export type StatusUpdate = { externalAccountId: string; providerMessageId: string; status: "delivered" | "read" | "failed" | "sent" };

export interface MessagingProvider {
  readonly name: string;
  send(account: IntegrationRef, msg: OutboundMessageInput): Promise<SendResult>;
  authenticateWebhook(headers: Headers, rawBody: string): boolean;
  routeWebhook(rawBody: string): { externalAccountId: string } | null;
  parseWebhook(rawBody: string): { messages: InboundMessage[]; statuses: StatusUpdate[] };
}

// ───────── identity (OTP delivery) ─────────
export interface IdentityDeliveryProvider {
  readonly name: string;
  sendCode(input: { tenantId: string; phone: string; code: string }): Promise<void>;
}

// ───────── receipts ─────────
export interface ReceiptProvider {
  readonly name: string;
  issueReceipt(input: { tenantId: string; paymentId: string; amountAgorot: number; payerName: string; method: string }): Promise<{
    documentNumber: string;
    url?: string;
  }>;
}

// ───────── SaaS subscription billing (platform owner's own account – never a synagogue's) ─────────
export interface SaaSBillingProvider {
  readonly name: string;
  chargeInvoice(input: { tenantId: string; invoiceId: string; amountAgorot: number }): Promise<
    { status: "succeeded"; chargeId: string } | { status: "failed"; chargeId: string; error: string }
  >;
}
