import { z } from "zod";
import type { Tx } from "./db/client";

// Every behaviour that is a business choice is decided by the synagogue's head gabbai in the settings screen.
// Fixed protections that are NOT configurable: no message without consent, after opt-out, or without debt;
// the opt-out line in reminders; debt reduced only by verified or approved payments.
export const tenantSettingsSchema = z.object({
  // messages
  paymentConfirmationMessage: z.boolean().default(true),
  pauseAfterPaymentLinkHours: z.number().int().min(0).max(168).default(24),
  pauseRemindersOnOpenTask: z.boolean().default(true),
  // personal page / bot
  portalPartialPayment: z.boolean().default(true),
  portalMinPartialAgorot: z.number().int().min(0).max(10_000_00).default(0),
  portalSelectPledges: z.boolean().default(true),
  portalReportExternalPayment: z.boolean().default(true),
  portalInquiry: z.boolean().default(true),
  personalLinkDays: z.number().int().min(1).max(365).default(30),
  // money
  autoApplyCredit: z.boolean().default(true),
  // receipts (only when a receipt service is connected)
  autoReceipts: z.boolean().default(true),
});

export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

/** Parses stored JSON, ignoring unknown/invalid keys and filling defaults. */
export function parseSettings(raw: unknown): TenantSettings {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [k, field] of Object.entries(tenantSettingsSchema.shape)) {
    const r = (field as z.ZodType).safeParse(obj[k]);
    out[k] = r.success ? r.data : (field as z.ZodType).parse(undefined);
  }
  return out as TenantSettings;
}

export async function tenantSettings(tx: Tx, tenantId: string): Promise<TenantSettings> {
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return parseSettings(t?.settings);
}
