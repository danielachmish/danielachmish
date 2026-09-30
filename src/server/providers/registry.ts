import type { IdentityDeliveryProvider, IntegrationRef, MessagingProvider, PaymentProvider, ReceiptProvider, SaaSBillingProvider } from "./types";
import { fakePaymentProvider } from "./fake-payment";
import { payplusProvider } from "./payplus";
import { fakeIdentityProvider, fakeMessagingProvider, fakeReceiptProvider, fakeSaaSBillingProvider } from "./fake-others";
import { whatsappCloudProvider } from "./whatsapp-cloud";
import { decryptJson } from "../crypto";
import { isDemo, isProductionEnv, modeFor } from "../env";
import { normalizePhone } from "../util/phone";
import { fakeAllowed } from "./guard";
import { whatsappIdentityProvider } from "./whatsapp-otp";
import { twilioSmsProvider } from "./twilio-sms";

// Integration accounts must match the deployment's mode for their kind; fake is impossible in production.
function assertEnvironment(env: string, kind: string = "payment") {
  const mode = modeFor(kind);
  if (isProductionEnv() && env === "fake") throw new Error("fake integrations are disabled in production");
  if (env !== mode) throw new Error(`${kind} integration environment "${env}" does not match the configured mode "${mode}"`);
}

export function paymentProvider(name: string): PaymentProvider {
  if (name === "fake") {
    assertEnvironment("fake");
    return fakePaymentProvider;
  }
  if (name === "payplus") return payplusProvider;
  throw new Error(`unknown payment provider ${name}`);
}

export function messagingProvider(name: string): MessagingProvider {
  if (name === "fake") {
    assertEnvironment("fake", "messaging");
    return fakeMessagingProvider;
  }
  if (name === "whatsapp_cloud") return whatsappCloudProvider;
  throw new Error(`unknown messaging provider ${name}`);
}

export function identityProvider(): IdentityDeliveryProvider {
  const ch = process.env.OTP_CHANNEL ?? "fake";
  if (ch === "fake") {
    if (isProductionEnv()) throw new Error("fake OTP channel is disabled in production");
    return fakeIdentityProvider;
  }
  if (ch === "whatsapp") return whatsappIdentityProvider;
  if (ch === "sms") {
    // Demo site: real SMS only to numbers explicitly allowed (e.g. the owner's phone); the demo's dummy
    // numbers may belong to real people, so their codes stay in the development inbox.
    if (isDemo()) {
      const allow = new Set((process.env.DEMO_SMS_ALLOW ?? "").split(",").map((x) => normalizePhone(x)).filter(Boolean));
      return { name: "sms-demo", sendCode: (i) => (allow.has(i.phone) ? twilioSmsProvider.sendCode(i) : fakeIdentityProvider.sendCode(i)) };
    }
    return twilioSmsProvider;
  }
  throw new Error(`OTP channel "${ch}" is not implemented yet (open business decision)`);
}

export function receiptProvider(): ReceiptProvider | null {
  // No real receipt service is connected yet (open decision). Fake only outside production.
  return fakeAllowed() ? fakeReceiptProvider : null;
}

export function saasBillingProvider(): SaaSBillingProvider | null {
  return fakeAllowed() ? fakeSaaSBillingProvider : null;
}

export function toIntegrationRef(row: {
  kind?: string;
  id: string;
  tenantId: string;
  provider: string;
  environment: string;
  externalAccountId: string;
  encryptedSecrets: string | null;
}): IntegrationRef {
  assertEnvironment(row.environment, row.kind ?? "payment");
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    environment: row.environment as IntegrationRef["environment"],
    externalAccountId: row.externalAccountId,
    secrets: row.encryptedSecrets ? decryptJson<Record<string, string>>(row.encryptedSecrets) : {},
  };
}
