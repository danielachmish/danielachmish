import type { Tx } from "../db/client";

// What a tenant may do in each subscription state. Existing money flows (callbacks, refunds,
// reconciliation, export) are never blocked by subscription state.
export type SubStatus = "trial" | "active" | "past_due" | "grace" | "suspended" | "cancelled";

const ACTIVE: SubStatus[] = ["trial", "active", "past_due", "grace"];

export const canCreatePaymentRequests = (s: string | null | undefined) => ACTIVE.includes((s ?? "") as SubStatus);
export const canSendReminders = (s: string | null | undefined) => ACTIVE.includes((s ?? "") as SubStatus);

export async function subscriptionOf(tx: Tx, tenantId: string) {
  return tx.saaSSubscription.findUnique({ where: { tenantId } });
}

export function canExport(sub: { status: string; accessEndsAt: Date | null } | null, now = new Date()) {
  if (!sub) return false;
  if (sub.status !== "cancelled") return true;
  return !!sub.accessEndsAt && sub.accessEndsAt > now;
}
