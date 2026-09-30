import type { IdentityDeliveryProvider, IntegrationRef, MessagingProvider, PaymentProvider, ReceiptProvider, SaaSBillingProvider } from "./types";
import { fakePaymentProvider } from "./fake-payment";
import { payplusProvider } from "./payplus";
import { fakeIdentityProvider, fakeMessagingProvider, fakeReceiptProvider, fakeSaaSBillingProvider } from "./fake-others";
import { whatsappCloudProvider } from "./whatsapp-cloud";
import { decryptJson } from "../crypto";
import { isProductionEnv } from "../env";
import { fakeAllowed } from "./guard";
import { whatsappIdentityProvider } from "./whatsapp-otp";

// Integration accounts must match the deployment's PROVIDER_MODE; fake is impossible in production.
function assertEnvironment(env: string) {
  const mode = process.env.PROVIDER_MODE ?? "fake";
  if (isProductionEnv() && env === "fake") throw new Error("fake integrations are disabled in production");
  if (env !== mode) throw new Error(`integration environment "${env}" does not match PROVIDER_MODE "${mode}"`);
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
    assertEnvironment("fake");
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
  id: string;
  tenantId: string;
  provider: string;
  environment: string;
  externalAccountId: string;
  encryptedSecrets: string | null;
}): IntegrationRef {
  assertEnvironment(row.environment);
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    environment: row.environment as IntegrationRef["environment"],
    externalAccountId: row.externalAccountId,
    secrets: row.encryptedSecrets ? decryptJson<Record<string, string>>(row.encryptedSecrets) : {},
  };
}
