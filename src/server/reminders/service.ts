import { systemCtx, withContext, type DbContext } from "../db/context";
import { loadCard, pledgeFigures } from "../ledger/balance";
import { localDateKey, nextSendWindow, policyOf, reminderDueAt } from "./calendar";
import { effectiveBlockers, HARD_BLOCKS, reminderBlockers, type SkipReason } from "./eligibility";
import { messagingProvider, toIntegrationRef } from "../providers/registry";
import { issuePersonalLink } from "../portal/links";
import { renderReminder } from "./template";
import { DomainError, notFound } from "../errors";
import { audit } from "../audit";
import { enqueue, QUEUES } from "../queue";

/**
 * Automatic reminders: at most one scheduled reminder per card, following the synagogue's policy
 * (enabled, delays, days, hour, holidays). Idempotent per (card, local due date).
 */
export async function scanReminders(tenantId: string, now = new Date()) {
  return withContext(systemCtx(tenantId), async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!tenant.remindersEnabled || tenant.reminderDays.length === 0) return { scheduled: 0, disabled: true };
    const policy = policyOf(tenant);
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
      const at = nextSendWindow(now, policy);
      // ON CONFLICT DO NOTHING – a unique violation inside the transaction would abort it.
      const r = await tx.outboundMessage.createMany({
        data: [{ tenantId, congregantId: id, kind: "reminder", idempotencyKey: `reminder:${id}:${localDateKey(due)}`, scheduledFor: at }],
        skipDuplicates: true,
      });
      scheduled += r.count;
    }
    return { scheduled, disabled: false };
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
    if (msg.kind === "reminder") {
      // The reminder being sent right now must not block itself as "recent".
      const all = (await reminderBlockers(tx, tenantId, msg.congregantId)).filter((r) => r !== "recent_reminder" || msg.trigger === "auto");
      blockers = effectiveBlockers(all, msg.overrideSoft);
      // Automatic reminders stop immediately when the gabbai turns them off.
      if (msg.trigger === "auto" && !tenant.remindersEnabled) blockers.push("auto_disabled");
    } else if (c.messagingOptOut && msg.kind !== "menu_reply") blockers = ["opted_out"];
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
        text: renderReminder(tenant.reminderTemplate, {
          firstName: c.firstName,
          lastName: c.lastName,
          debtAgorot: summary.debtAgorot,
          synagogueName: tenant.name,
          link: link.url,
        }),
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

// ───────────── manual sending (gabbai decides, any time) ─────────────

export type ManualCheck = { hard: SkipReason[]; soft: SkipReason[] };

export async function manualReminderCheck(ctx: DbContext & { tenantId: string }, congregantId: string): Promise<ManualCheck> {
  return withContext(ctx, async (tx) => {
    if (!(await tx.congregant.findUnique({ where: { id: congregantId } }))) throw notFound("כרטיס המתפלל");
    const all = await reminderBlockers(tx, ctx.tenantId, congregantId);
    return { hard: all.filter((r) => HARD_BLOCKS.includes(r)), soft: all.filter((r) => !HARD_BLOCKS.includes(r)) };
  });
}

/**
 * Sends a reminder to one card now. Hard blocks always refuse. Soft blocks (open inquiry, pending payment,
 * payment link just opened, reminder sent in the last 24h) refuse unless the gabbai explicitly overrides.
 * The client op id makes double clicks / retries send once.
 */
export async function sendReminderNow(
  ctx: DbContext & { tenantId: string },
  input: { congregantId: string; overrideSoft: boolean; clientOpId: string; requestedBy: string },
) {
  const now = new Date();
  const msgId = await withContext(ctx, async (tx) => {
    const existing = await tx.outboundMessage.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: `manual:${input.clientOpId}` } },
    });
    if (existing) return { id: existing.id, duplicate: true };
    if (!(await tx.congregant.findUnique({ where: { id: input.congregantId } }))) throw notFound("כרטיס המתפלל");
    const all = await reminderBlockers(tx, ctx.tenantId, input.congregantId);
    const hard = all.filter((r) => HARD_BLOCKS.includes(r));
    if (hard.length) throw new DomainError("reminder_blocked", `לא ניתן לשלוח: ${hard.map((r) => SKIP_TEXT[r]).join(", ")}.`, 409);
    const soft = all.filter((r) => !HARD_BLOCKS.includes(r));
    if (soft.length && !input.overrideSoft)
      throw new DomainError("reminder_needs_confirmation", `שימו לב: ${soft.map((r) => SKIP_TEXT[r]).join(", ")}. לשלוח בכל זאת?`, 409);
    // A manual reminder replaces any automatic one waiting in the queue for this card.
    await tx.outboundMessage.updateMany({
      where: { congregantId: input.congregantId, kind: "reminder", status: "scheduled", trigger: "auto" },
      data: { status: "skipped", skipReason: "replaced_by_manual" },
    });
    const m = await tx.outboundMessage.create({
      data: {
        tenantId: ctx.tenantId,
        congregantId: input.congregantId,
        kind: "reminder",
        idempotencyKey: `manual:${input.clientOpId}`,
        scheduledFor: now,
        trigger: "manual",
        overrideSoft: soft.length > 0 && input.overrideSoft,
        requestedBy: input.requestedBy,
      },
    });
    await audit(tx, ctx.tenantId, { type: "gabbai", id: input.requestedBy }, "reminder.manual_send", { type: "Congregant", id: input.congregantId }, {
      override: soft,
    });
    return { id: m.id, duplicate: false };
  });
  if (msgId.duplicate) return { status: "already_requested" as const };
  const r = await dispatchMessage(ctx.tenantId, msgId.id, now);
  const final = await withContext(ctx, (tx) => tx.outboundMessage.findUniqueOrThrow({ where: { id: msgId.id } }));
  return { status: r.sent ? ("sent" as const) : (final.status as string), skipReason: final.skipReason };
}

/** Preview for "send to everyone with a debt": who would get it and why others would not. */
export async function bulkReminderPreview(ctx: DbContext & { tenantId: string }) {
  return withContext(ctx, async (tx) => {
    const cards = await tx.congregant.findMany({ select: { id: true } });
    const eligible: string[] = [];
    const skipped: Record<string, number> = {};
    for (const c of cards) {
      const r = await reminderBlockers(tx, ctx.tenantId, c.id);
      if (r.includes("no_debt")) continue; // not relevant at all
      if (r.length === 0) eligible.push(c.id);
      else for (const x of r) skipped[x] = (skipped[x] ?? 0) + 1;
    }
    return { eligible: eligible.length, eligibleIds: eligible, skipped };
  });
}

/** Queues a manual reminder for every card that is fully eligible now (no overrides in bulk). */
export async function sendBulkRemindersNow(ctx: DbContext & { tenantId: string }, input: { clientOpId: string; requestedBy: string }) {
  const preview = await bulkReminderPreview(ctx);
  const now = new Date();
  const created = await withContext(ctx, async (tx) => {
    let n = 0;
    for (const id of preview.eligibleIds) {
      const r = await tx.outboundMessage.createMany({
        data: [{ tenantId: ctx.tenantId, congregantId: id, kind: "reminder", idempotencyKey: `bulk:${input.clientOpId}:${id}`, scheduledFor: now, trigger: "manual_bulk", requestedBy: input.requestedBy }],
        skipDuplicates: true,
      });
      if (r.count) {
        await tx.outboundMessage.updateMany({ where: { congregantId: id, kind: "reminder", status: "scheduled", trigger: "auto" }, data: { status: "skipped", skipReason: "replaced_by_manual" } });
        n++;
      }
    }
    await audit(tx, ctx.tenantId, { type: "gabbai", id: input.requestedBy }, "reminder.bulk_send", undefined, { queued: n });
    return n;
  }, { timeout: 60_000 });
  // The worker sends them within a minute (each one re-checked right before sending).
  await enqueue(QUEUES.sweep, {});
  return { queued: created, skipped: preview.skipped };
}

export async function cancelScheduledReminder(ctx: DbContext & { tenantId: string }, messageId: string, by: string) {
  return withContext(ctx, async (tx) => {
    const r = await tx.outboundMessage.updateMany({
      where: { id: messageId, kind: "reminder", status: "scheduled" },
      data: { status: "skipped", skipReason: "cancelled_by_gabbai" },
    });
    if (r.count === 0) throw new DomainError("not_scheduled", "התזכורת כבר נשלחה או בוטלה.", 409);
    await audit(tx, ctx.tenantId, { type: "gabbai", id: by }, "reminder.cancel", { type: "OutboundMessage", id: messageId });
  });
}

/** After a policy change, drop queued automatic reminders so the next scan reschedules them by the new rules. */
export async function rescheduleAfterPolicyChange(tx: Parameters<Parameters<typeof withContext>[1]>[0]) {
  await tx.outboundMessage.updateMany({
    where: { kind: "reminder", status: "scheduled", trigger: "auto" },
    data: { status: "skipped", skipReason: "policy_changed" },
  });
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

export const SKIP_TEXT: Record<string, string> = {
  no_debt: "אין חוב פתוח",
  no_phone: "אין מספר טלפון",
  no_consent: "המתפלל לא נתן הסכמה להודעות",
  opted_out: "המתפלל ביקש להפסיק הודעות",
  open_inquiry_or_report: "יש בירור או דיווח תשלום פתוח",
  pending_external_payment: "יש תשלום שממתין לאישור",
  open_payment_request: "המתפלל פתח לאחרונה דף תשלום",
  recent_reminder: "נשלחה תזכורת ב-24 השעות האחרונות",
  messaging_not_connected: "וואטסאפ לא מחובר",
  quota_exhausted: "מכסת ההודעות החודשית נוצלה",
  subscription_inactive: "המנוי אינו פעיל",
  auto_disabled: "תזכורות אוטומטיות כבויות",
  replaced_by_manual: "הוחלפה בשליחה ידנית",
  cancelled_by_gabbai: "בוטלה ע״י הגבאי",
  policy_changed: "ההגדרות שונו – תתוזמן מחדש",
};
