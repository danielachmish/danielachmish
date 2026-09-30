import { withContext, type DbContext } from "../db/context";
import { loadCard } from "../ledger/balance";
import { issuePersonalLink } from "../portal/links";
import { renderReminder } from "./template";
import { reminderBlockers, type SkipReason } from "./eligibility";
import { DomainError, notFound } from "../errors";
import { audit } from "../audit";
import { SKIP_TEXT } from "./service";
import { cardSummaries } from "../ledger/aggregate";

// "Send from my WhatsApp": the system prepares the text and a personal link, and hands it to the gabbai's own
// WhatsApp (wa.me). Free and needs no WhatsApp Business account. Delivery is by the gabbai, so it is recorded
// as "handed_off", never as delivered.

// Never send: no debt, no phone, or the congregant asked to stop. Everything else is shown as a warning and
// the gabbai's click is the explicit decision (it is his personal WhatsApp).
export const SHARE_HARD_BLOCKS: SkipReason[] = ["no_debt", "no_phone", "opted_out"];
const IRRELEVANT_FOR_SHARE: SkipReason[] = ["messaging_not_connected", "quota_exhausted", "subscription_inactive"];

export async function shareWarnings(tx: Parameters<Parameters<typeof withContext>[1]>[0], tenantId: string, congregantId: string) {
  const all = await reminderBlockers(tx, tenantId, congregantId);
  return {
    hard: all.filter((r) => SHARE_HARD_BLOCKS.includes(r)),
    soft: all.filter((r) => !SHARE_HARD_BLOCKS.includes(r) && !IRRELEVANT_FOR_SHARE.includes(r)),
  };
}

export const waMeUrl = (phoneE164: string, text: string) => `https://wa.me/${phoneE164.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;

export async function shareReminderViaWhatsApp(ctx: DbContext & { tenantId: string }, congregantId: string, requestedBy: string) {
  return withContext(ctx, async (tx) => {
    const c = await tx.congregant.findUnique({ where: { id: congregantId } });
    if (!c) throw notFound("כרטיס המתפלל");
    const w = await shareWarnings(tx, ctx.tenantId, congregantId);
    if (w.hard.length) throw new DomainError("share_blocked", `לא ניתן לשלוח: ${w.hard.map((r) => SKIP_TEXT[r]).join(", ")}.`, 409);
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
    const summary = (await loadCard(tx, c.id)).summary;
    const link = await issuePersonalLink(tx, ctx.tenantId, c.id, requestedBy);
    const vars = { firstName: c.firstName, lastName: c.lastName, debtAgorot: summary.debtAgorot, synagogueName: tenant.name };
    const text = renderReminder(tenant.reminderTemplate, { ...vars, link: link.url });
    const now = new Date();
    await tx.outboundMessage.create({
      data: {
        tenantId: ctx.tenantId,
        congregantId: c.id,
        kind: "reminder",
        trigger: "manual_share",
        status: "handed_off",
        idempotencyKey: `share:${c.id}:${now.getTime()}`,
        scheduledFor: now,
        attemptedAt: now,
        overrideSoft: w.soft.length > 0,
        requestedBy,
        // The personal link is not stored in message history.
        body: { text: renderReminder(tenant.reminderTemplate, { ...vars, link: "[קישור אישי]" }) },
      },
    });
    await audit(tx, ctx.tenantId, { type: "gabbai", id: requestedBy }, "reminder.whatsapp_share", { type: "Congregant", id: c.id }, { warnings: w.soft });
    return { url: waMeUrl(c.phone!, text) };
  });
}

/** Debtors the gabbai can message from his own WhatsApp (phone present, not opted out). */
export async function shareCandidates(tx: Parameters<Parameters<typeof withContext>[1]>[0]) {
  const sums = await cardSummaries(tx);
  const reachable = await tx.congregant.findMany({
    where: { phone: { not: null }, messagingOptOut: false },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const since = new Date(Date.now() - 24 * 3600_000);
  const recent = new Set(
    (
      await tx.outboundMessage.findMany({
        where: { kind: "reminder", attemptedAt: { gt: since }, status: { in: ["handed_off", "accepted", "delivered", "read"] } },
        select: { congregantId: true },
      })
    ).map((m) => m.congregantId),
  );
  return reachable
    .map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      debt: sums.get(p.id)?.debtAgorot ?? 0,
      pending: (sums.get(p.id)?.pendingExternalAgorot ?? 0) > 0,
      recent: recent.has(p.id),
    }))
    .filter((p) => p.debt > 0);
}
