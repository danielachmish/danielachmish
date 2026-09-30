"use server";

import { revalidatePath } from "next/cache";
import { assertFakeAllowed, fakeAllowed } from "@/server/providers/guard";
import { fakeCallback, fakeCompleteCheckout, fakeRefund, FAKE_SIGNATURE_HEADER, type FakeOutcome } from "@/server/providers/fake-payment";
import { receivePaymentCallback } from "@/server/payments/intake";
import { receiveMessagingWebhook } from "@/server/messaging/bot";
import { prisma } from "@/server/db/client";
import { systemCtx, withContext } from "@/server/db/context";
import { toIntegrationRef } from "@/server/providers/registry";
import { hmacSha256 } from "@/server/crypto";
import { enqueue, QUEUES } from "@/server/queue";
import { after } from "next/server";
import { inlineJobs } from "@/server/env";
import { processEventAndFollowUps, sweep } from "@/worker/jobs";

function guard() {
  if (!fakeAllowed()) throw new Error("dev tools disabled");
  assertFakeAllowed();
}

async function integrationFor(externalAccountId: string, kind: "payment" | "messaging") {
  const acct = (await prisma.$queryRaw<{ id: string; tenant_id: string }[]>`SELECT * FROM resolve_integration_account(${kind}, 'fake', 'fake', ${externalAccountId})`)[0];
  if (!acct) throw new Error("unknown fake account");
  return withContext(systemCtx(acct.tenant_id), (tx) => tx.integrationAccount.findUniqueOrThrow({ where: { id: acct.id } }));
}

/** Simulates the customer finishing the hosted page, and (optionally) the provider callback. */
export async function fakeCheckoutAction(pageRef: string, outcome: FakeOutcome, sendCallback: boolean, amountOverride?: number) {
  guard();
  const { txn, page } = await fakeCompleteCheckout(pageRef, outcome, { amountAgorot: amountOverride });
  if (sendCallback) {
    const acct = await integrationFor(page.accountId, "payment");
    const { raw, signature } = fakeCallback(toIntegrationRef(acct), { page_ref: pageRef, transaction_id: txn.transactionId });
    const r = await receivePaymentCallback("fake", new Headers({ [FAKE_SIGNATURE_HEADER]: signature }), raw);
    if (r.outcome === "accepted" && inlineJobs()) after(() => processEventAndFollowUps(r.tenantId, r.eventId));
  }
  return { returnUrl: outcome === "charged" ? page.successUrl : page.failureUrl };
}

export async function fakeRefundAction(accountId: string, transactionId: string, amountShekels: number) {
  guard();
  const acct = await integrationFor(accountId, "payment");
  const rf = await fakeRefund(accountId, transactionId, Math.round(amountShekels * 100));
  const { raw, signature } = fakeCallback(toIntegrationRef(acct), { transaction_id: rf.transactionId });
  const r = await receivePaymentCallback("fake", new Headers({ [FAKE_SIGNATURE_HEADER]: signature }), raw);
  if (r.outcome === "accepted" && inlineJobs()) after(() => processEventAndFollowUps(r.tenantId, r.eventId));
  revalidatePath("/dev/inbox");
}

export async function fakeInboundAction(account: string, from: string, text: string) {
  guard();
  const raw = JSON.stringify({ account, messages: [{ from, text, id: `in_${crypto.randomUUID()}` }] });
  const r = await receiveMessagingWebhook("fake", new Headers({ "x-fake-signature": hmacSha256(process.env.FAKE_MESSAGING_WEBHOOK_SECRET ?? "dev-messaging-secret", raw) }), raw);
  if (r.outcome === "accepted" && inlineJobs()) after(() => processEventAndFollowUps(r.tenantId, r.eventId));
  revalidatePath("/dev/inbox");
}

/** Lets a developer trigger the minute sweep immediately instead of waiting for the cron. */
export async function runSweepAction() {
  guard();
  if (inlineJobs()) await sweep();
  else await enqueue(QUEUES.sweep, {});
  revalidatePath("/dev/inbox");
}
