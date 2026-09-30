import type { Tx } from "../db/client";
import { cardSummary } from "../ledger/balance";
import { canSendReminders } from "../billing/policy";
import { planConfig } from "../config";
import { parseSettings } from "../settings";

export type SkipReason =
  | "no_debt"
  | "no_phone"
  | "no_consent"
  | "opted_out"
  | "open_inquiry_or_report"
  | "pending_external_payment"
  | "open_payment_request"
  | "recent_reminder"
  | "messaging_not_connected"
  | "quota_exhausted"
  | "subscription_inactive";

// Hard blocks can never be overridden (consent, opt-out, no debt, technical/plan limits).
export const HARD_BLOCKS: SkipReason[] = [
  "no_debt",
  "no_phone",
  "no_consent",
  "opted_out",
  "messaging_not_connected",
  "quota_exhausted",
  "subscription_inactive",
];
// Soft blocks pause automatic reminders; the gabbai may explicitly choose to send a manual one anyway.
export const SOFT_BLOCKS: SkipReason[] = ["open_inquiry_or_report", "pending_external_payment", "open_payment_request", "recent_reminder"];

const RECENT_MANUAL_WINDOW_H = 24;

/** Full eligibility check. Called when scheduling AND again immediately before sending. */
export async function reminderBlockers(tx: Tx, tenantId: string, congregantId: string): Promise<SkipReason[]> {
  const reasons: SkipReason[] = [];
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  const s = parseSettings(tenant.settings);
  const c = await tx.congregant.findUniqueOrThrow({ where: { id: congregantId } });
  const summary = await cardSummary(tx, congregantId);
  if (summary.balanceAgorot <= 0 || summary.debtAgorot <= 0) reasons.push("no_debt");
  if (!c.phone) reasons.push("no_phone");
  if (c.messagingOptOut) reasons.push("opted_out");
  const consent = await tx.consent.findFirst({ where: { congregantId, channel: "whatsapp" }, orderBy: { createdAt: "desc" } });
  if (!consent?.granted) reasons.push("no_consent");
  if (s.pauseRemindersOnOpenTask && (await tx.task.count({ where: { congregantId, status: "open", pausesReminders: true } })))
    reasons.push("open_inquiry_or_report");
  if (summary.pendingExternalAgorot > 0) reasons.push("pending_external_payment");
  if (s.pauseAfterPaymentLinkHours > 0) {
    const openReq = await tx.paymentRequest.count({
      where: { congregantId, status: "open", createdAt: { gt: new Date(Date.now() - s.pauseAfterPaymentLinkHours * 3600_000) } },
    });
    if (openReq) reasons.push("open_payment_request");
  }
  const recent = await tx.outboundMessage.count({
    where: { congregantId, kind: "reminder", status: { in: ["accepted", "delivered", "read", "sending", "unknown"] }, attemptedAt: { gt: new Date(Date.now() - RECENT_MANUAL_WINDOW_H * 3600_000) } },
  });
  if (recent) reasons.push("recent_reminder");
  const messaging = await tx.integrationAccount.findFirst({ where: { kind: "messaging", status: "active" } });
  if (!messaging) reasons.push("messaging_not_connected");
  const sub = await tx.saaSSubscription.findUnique({ where: { tenantId } });
  if (!canSendReminders(sub?.status)) reasons.push("subscription_inactive");
  if (sub && sub.messagesUsed >= planConfig().monthlyMessageQuota) reasons.push("quota_exhausted");
  return reasons;
}

export const effectiveBlockers = (reasons: SkipReason[], overrideSoft: boolean) =>
  overrideSoft ? reasons.filter((r) => HARD_BLOCKS.includes(r)) : reasons;
