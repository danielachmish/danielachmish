import { prisma } from "../db/client";
import { systemCtx, withContext } from "../db/context";
import { isUniqueViolation } from "../errors";
import { sha256 } from "../crypto";
import { modeFor } from "../env";
import { paymentProvider, toIntegrationRef } from "../providers/registry";
import { enqueue, QUEUES } from "../queue";

/**
 * Durable inbox for payment callbacks. Steps:
 *  1. route by the provider account in the body → registered IntegrationAccount (never by client input)
 *  2. authenticate with that account's secret (documented provider mechanism)
 *  3. store the raw event once (dedupe by body hash) and enqueue processing
 * Unknown accounts are stored as UnroutedEvent without the body. Nothing here changes balances.
 */
export async function receivePaymentCallback(providerName: string, headers: Headers, rawBody: string) {
  const provider = paymentProvider(providerName);
  const routing = provider.routeCallback(rawBody);
  const bodyHash = sha256(rawBody);
  const env = modeFor("payment");

  const acct = routing
    ? (
        await prisma.$queryRaw<{ id: string; tenant_id: string; status: string }[]>`
          SELECT * FROM resolve_integration_account('payment', ${providerName}, ${env}, ${routing.externalAccountId})`
      )[0]
    : undefined;

  if (!routing || !acct) {
    await withContext(systemCtx(), (tx) =>
      tx.unroutedEvent.create({
        data: { provider: providerName, reason: routing ? "unknown_account" : "unparseable", headers: {}, bodyHash },
      }),
    );
    return { outcome: "unrouted" as const };
  }

  const tenantId = acct.tenant_id;
  const integration = await withContext(systemCtx(tenantId), (tx) => tx.integrationAccount.findUniqueOrThrow({ where: { id: acct.id } }));
  const authenticated = provider.authenticateCallback(toIntegrationRef(integration), headers, rawBody);

  let eventId: string;
  try {
    const ev = await withContext(systemCtx(tenantId), (tx) =>
      tx.providerEvent.create({
        data: {
          tenantId,
          integrationAccountId: integration.id,
          provider: providerName,
          kind: "payment_callback",
          dedupeKey: bodyHash,
          payload: JSON.parse(rawBody),
          authenticated,
        },
      }),
    );
    eventId = ev.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { outcome: "duplicate" as const };
    throw e;
  }
  await enqueue(QUEUES.providerEvent, { tenantId, eventId }, { singletonKey: eventId });
  return { outcome: "accepted" as const, eventId, tenantId };
}
