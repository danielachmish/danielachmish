import { systemCtx, withContext } from "../db/context";
import { loadCard, pledgeFigures } from "../ledger/balance";
import { localDateKey, nextSendWindow, reminderDueAt } from "./calendar";
import { reminderBlockers } from "./eligibility";
import { messagingProvider, toIntegrationRef } from "../providers/registry";
import { issuePersonalLink } from "../portal/links";
import { formatILS } from "../money";
import { isUniqueViolation } from "../errors";

/** Creates at most one scheduled reminder per card when one is due. Idempotent per (card, local due date). */
export async function scanReminders(tenantId: string, now = new Date()) {
  return withContext(systemCtx(tenantId), async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const cards = await tx.congregant.findMany({ where: { phone: { not: null }, messagingOptOut: false }, select: { id: true } });
    let scheduled = 0;
    for (const { id } of cards) {
      const pending = await tx.outboundMessage.count({ where: { congregantId: id, kind: "reminder", status: { in: ["scheduled", "sending"] } } });
      if (pending) continue;
      const card = await loadCard(tx, id);
      const open = card.pledges.filter((p) => pledgeFigures(p).outstanding > 0);
      if (open.length === 0) continue;
      const oldest = open.map((p) => p.dueDate ?? p.pledgeDate).sort((a, b) => a.getTime() - b.getTime())[0]!;
      const last = await tx.outboundMessage.findFirst({
        where: { congregantId: id, kind: "reminder", status: { in: ["accepted", "delivered", "read", "unknown", "sending"] } },
        orderBy: { attemptedAt: "desc" },
      });
      const due = reminderDueAt({
        oldestOpenDate: oldest,
        lastReminderAt: last?.attemptedAt ?? null,
        firstDelayDays: tenant.reminderFirstDelayDays,
        intervalDays: tenant.reminderIntervalDays,
      });
      if (due > now) continue;
      if ((await reminderBlockers(tx, tenantId, id)).length) continue;
      const at = nextSendWindow(now);
      try {
        await tx.outboundMessage.create({
          data: { tenantId, congregantId: id, kind: "reminder", idempotencyKey: `reminder:${id}:${localDateKey(due)}`, scheduledFor: at },
        });
        scheduled++;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    return { scheduled };
  });
}

/**
 * Sends one scheduled message. Phase 1 (tx): lock row, re-check eligibility and balance, mark "sending",
 * count quota. Phase 2: provider call. Phase 3: record the provider result. A crash between 1 and 3
 * leaves "sending" which is never retried automatically (see markStuckSending).
 */
export async function dispatchMessage(tenantId: string, messageId: string, now = new Date()) {
  const ctx = systemCtx(tenantId);
  const prepared = await withContext(ctx, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "OutboundMessage" WHERE id = ${messageId}::uuid AND status = 'scheduled' AND "scheduledFor" <= ${now} FOR UPDATE SKIP LOCKED`;
    if (!rows.length) return null;
    const msg = await tx.outboundMessage.findUniqueOrThrow({ where: { id: messageId } });
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const c = await tx.congregant.findUniqueOrThrow({ where: { id: msg.congregantId } });
    let blockers: string[] = [];
    if (msg.kind === "reminder") blockers = await reminderBlockers(tx, tenantId, msg.congregantId);
    else if (c.messagingOptOut && msg.kind !== "menu_reply") blockers = ["opted_out"];
    const integration = await tx.integrationAccount.findFirst({ where: { kind: "messaging", status: "active" } });
    if (!integration) blockers.push("messaging_not_connected");
    if (!c.phone) blockers.push("no_phone");
    if (blockers.length || !integration) {
      await tx.outboundMessage.update({ where: { id: messageId }, data: { status: "skipped", skipReason: [...new Set(blockers)].join(",") } });
      return null;
    }
    let body = (msg.body as { text?: string } | null) ?? null;
    if (msg.kind === "reminder") {
      const summary = (await loadCard(tx, c.id)).summary;
      const link = await issuePersonalLink(tx, tenantId, c.id, "system:reminder");
      body = {
        text: `שלום ${c.firstName}, תזכורת מ${tenant.name}: היתרה הפתוחה שלך היא ${formatILS(summary.debtAgorot)}. לצפייה ולתשלום: ${link.url}\nלהפסקת תזכורות השיבו "הסר".`,
      };
    }
    await tx.outboundMessage.update({ where: { id: messageId }, data: { status: "sending", attemptedAt: now, body: body ?? undefined } });
    await tx.saaSSubscription.updateMany({ where: { tenantId }, data: { messagesUsed: { increment: 1 } } });
    return { msg, phone: c.phone!, integration, body };
  });
  if (!prepared) return { sent: false };

  const provider = messagingProvider(prepared.integration.provider);
  const result = await provider.send(toIntegrationRef(prepared.integration), {
    to: prepared.phone,
    idempotencyKey: prepared.msg.idempotencyKey,
    text: prepared.body?.text,
  });
  await withContext(ctx, async (tx) => {
    if (result.status === "accepted")
      await tx.outboundMessage.update({ where: { id: messageId }, data: { status: "accepted", providerMessageId: result.providerMessageId } });
    else if (result.status === "rejected")
      await tx.outboundMessage.update({ where: { id: messageId }, data: { status: "failed", providerStatus: result.error.slice(0, 200) } });
    else {
      // Unknown outcome: never resend blindly; surface for review.
      await tx.outboundMessage.update({ where: { id: messageId }, data: { status: "unknown", providerStatus: result.error.slice(0, 200) } });
      await tx.task.create({
        data: { tenantId, kind: "provider_exception", congregantId: prepared.msg.congregantId, summary: "לא ידוע אם ההודעה נמסרה – לא נשלחה שוב.", details: { messageId } },
      });
    }
  });
  return { sent: result.status === "accepted", result: result.status };
}

export async function dueMessages(tenantId: string, now = new Date()) {
  return withContext(systemCtx(tenantId), (tx) =>
    tx.outboundMessage.findMany({ where: { status: "scheduled", scheduledFor: { lte: now } }, select: { id: true }, take: 500 }),
  );
}

/** Messages stuck in "sending" (crash mid-send) become "unknown" – not resent. */
export async function markStuckSending(tenantId: string, olderThanMinutes = 10) {
  return withContext(systemCtx(tenantId), (tx) =>
    tx.outboundMessage.updateMany({
      where: { status: "sending", attemptedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
      data: { status: "unknown", providerStatus: "interrupted" },
    }),
  );
}
