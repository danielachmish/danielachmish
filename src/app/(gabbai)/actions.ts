"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { run, type ActionResult } from "@/server/actions/result";
import { DomainError } from "@/server/errors";
import { parseShekelsToAgorot } from "@/server/money";
import { adjustPledge, applyAvailableCredit, createPledge, decideExternalPayment, lockCard, reportExternalPayment } from "@/server/ledger/engine";
import { tenantSettingsSchema, type TenantSettings } from "@/server/settings";
import { validateTemplate } from "@/server/reminders/template";
import { bulkReminderPreview, cancelScheduledReminder, rescheduleAfterPolicyChange, sendBulkRemindersNow, sendReminderNow } from "@/server/reminders/service";
import { createCongregant, grantFamilyAccess, recordConsent, updateCongregant, type CongregantInput } from "@/server/gabbai/congregants";
import {
  commitCongregantImport,
  commitPledgeImport,
  parseDate,
  previewCongregantImport,
  previewPledgeImport,
  reconcileFromReport,
  type ColumnMap,
  type PledgeColumnMap,
  type ReconColumnMap,
} from "@/server/gabbai/import-export";
import { issuePersonalLink, revokeLinks } from "@/server/portal/links";
import { connectIntegration, disconnectIntegration, type ConnectInput } from "@/server/integrations/connect";
import { finishEmbeddedSignup, storeWhatsappConnection, type SignupResult } from "@/server/integrations/whatsapp-signup";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db/client";
import { after } from "next/server";
import { inlineJobs } from "@/server/env";
import { dispatchDueFor } from "@/worker/jobs";

// Every action re-derives the tenant from the authenticated session (requireGabbai) and runs inside
// that tenant's RLS context. Ids coming from the browser are only looked up within that context.

const uuid = z.uuid();
const opId = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);
const money = (s: string) => parseShekelsToAgorot(s);
const date = (s: string | undefined | null, what: string) => {
  const d = parseDate(s);
  if (!d) throw new DomainError("bad_date", `${what} אינו תקין.`);
  return d;
};

export async function saveCongregantAction(id: string | null, input: CongregantInput): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const g = await requireGabbai();
    const c = await withContext(g.ctx, (tx) =>
      id ? updateCongregant(tx, g.tenantId, g.actor, uuid.parse(id), input) : createCongregant(tx, g.tenantId, g.actor, input),
    );
    revalidatePath("/congregants");
    return { id: c.id };
  }, "הכרטיס נשמר.");
}

export async function consentAction(congregantId: string, granted: boolean) {
  return run(async () => {
    const g = await requireGabbai();
    await withContext(g.ctx, (tx) => recordConsent(tx, g.tenantId, g.actor, uuid.parse(congregantId), granted));
    revalidatePath(`/congregants/${congregantId}`);
  }, granted ? "ההסכמה להודעות נרשמה." : "ההסכמה בוטלה.");
}

export async function familyAccessAction(congregantId: string, phone: string) {
  return run(async () => {
    const g = await requireGabbai();
    await withContext(g.ctx, (tx) => grantFamilyAccess(tx, g.tenantId, g.actor, uuid.parse(congregantId), phone));
    revalidatePath(`/congregants/${congregantId}`);
  }, "ההרשאה נוספה.");
}

export type PledgeForm = {
  congregantId: string;
  amount: string;
  date: string;
  dueDate?: string;
  category?: string;
  description?: string;
  internalNote?: string;
  clientOpId: string;
  kind?: "pledge" | "opening_balance";
};

async function addPledge(g: Awaited<ReturnType<typeof requireGabbai>>, f: PledgeForm) {
  return withContext(g.ctx, (tx) =>
    createPledge(tx, g.tenantId, g.actor, {
      congregantId: uuid.parse(f.congregantId),
      amountAgorot: money(f.amount),
      pledgeDate: date(f.date, "תאריך הנדר"),
      dueDate: f.dueDate ? date(f.dueDate, "מועד התשלום") : null,
      category: f.category?.trim() || null,
      description: f.description?.trim() || null,
      internalNote: f.internalNote?.trim() || null,
      clientOpId: opId.parse(f.clientOpId),
      kind: f.kind ?? "pledge",
    }),
  );
}

export async function addPledgeAction(f: PledgeForm) {
  return run(async () => {
    const g = await requireGabbai();
    const r = await addPledge(g, f);
    revalidatePath(`/congregants/${f.congregantId}`);
    return { id: r.pledge.id, duplicate: r.duplicate };
  }, "הנדר נרשם.");
}

/** Batch entry after Shabbat. Each row is independent and idempotent (clientOpId), so a retry never duplicates. */
export async function batchPledgesAction(rows: PledgeForm[]): Promise<ActionResult<{ results: { clientOpId: string; ok: boolean; error?: string }[] }>> {
  return run(async () => {
    const g = await requireGabbai();
    if (rows.length > 200) throw new DomainError("too_many", "אפשר לשמור עד 200 שורות בכל פעם.");
    const results = [];
    for (const r of rows) {
      const res = await run(() => addPledge(g, r));
      results.push({ clientOpId: r.clientOpId, ok: res.ok, error: res.ok ? undefined : res.error });
    }
    revalidatePath("/congregants");
    return { results };
  });
}

export async function adjustPledgeAction(input: { pledgeId: string; congregantId: string; direction: "increase" | "decrease"; amount: string; reason: string; releaseToCredit: boolean }) {
  return run(async () => {
    const g = await requireGabbai();
    const a = money(input.amount);
    await withContext(g.ctx, (tx) =>
      adjustPledge(tx, g.tenantId, g.actor, {
        pledgeId: uuid.parse(input.pledgeId),
        deltaAgorot: input.direction === "increase" ? a : -a,
        reason: input.reason,
        onExcess: input.releaseToCredit ? "release_to_credit" : "reject",
      }),
    );
    revalidatePath(`/congregants/${input.congregantId}`);
  }, "התיקון נשמר ותועד.");
}

export async function recordExternalPaymentAction(input: {
  congregantId: string;
  amount: string;
  method: "cash" | "transfer" | "check";
  reference?: string;
  note?: string;
  clientOpId: string;
  pledgeIds?: string[];
  received: boolean; // gabbai confirms the money was actually received
}) {
  return run(async () => {
    const g = await requireGabbai();
    await withContext(g.ctx, (tx) =>
      reportExternalPayment(tx, g.tenantId, g.actor, {
        congregantId: uuid.parse(input.congregantId),
        amountAgorot: money(input.amount),
        method: z.enum(["cash", "transfer", "check"]).parse(input.method),
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        clientOpId: opId.parse(input.clientOpId),
        preferPledgeIds: (input.pledgeIds ?? []).map((x) => uuid.parse(x)),
        // A check that has not cleared is recorded as pending – it does not reduce the debt.
        approveNow: input.received,
      }),
    );
    revalidatePath(`/congregants/${input.congregantId}`);
  }, input.received ? "התשלום נרשם והחוב עודכן." : "התשלום נרשם וממתין לאישור.");
}

export async function decidePaymentAction(paymentId: string, approve: boolean, reason?: string) {
  return run(async () => {
    const g = await requireGabbai();
    await withContext(g.ctx, (tx) => decideExternalPayment(tx, g.tenantId, g.actor, { paymentId: uuid.parse(paymentId), approve, reason }));
    revalidatePath("/payments");
    revalidatePath("/dashboard");
  }, approve ? "התשלום אושר והחוב עודכן." : "התשלום נדחה.");
}

export async function resolveTaskAction(taskId: string, resolution: string) {
  return run(async () => {
    const g = await requireGabbai();
    if (!resolution.trim()) throw new DomainError("resolution_required", "יש לכתוב במה הסתיים הטיפול.");
    await withContext(g.ctx, async (tx) => {
      const t = await tx.task.findUnique({ where: { id: uuid.parse(taskId) } });
      if (!t || t.status !== "open") throw new DomainError("not_found", "המשימה לא נמצאה או שכבר טופלה.", 404);
      if (t.kind === "external_payment" && t.paymentId)
        throw new DomainError("use_payment_decision", "יש לאשר או לדחות את התשלום עצמו במסך התשלומים.", 409);
      await tx.task.update({ where: { id: t.id }, data: { status: "resolved", resolvedAt: new Date(), resolvedBy: g.userId, resolution: resolution.trim() } });
      await audit(tx, g.tenantId, g.actor, "task.resolve", { type: "Task", id: t.id });
    });
    revalidatePath("/tasks");
  }, "המשימה סומנה כמטופלת.");
}

export async function issueLinkAction(congregantId: string) {
  return run(async () => {
    const g = await requireGabbai();
    return withContext(g.ctx, async (tx) => {
      const c = await tx.congregant.findUnique({ where: { id: uuid.parse(congregantId) } });
      if (!c) throw new DomainError("not_found", "הכרטיס לא נמצא.", 404);
      const l = await issuePersonalLink(tx, g.tenantId, c.id, g.userId);
      await audit(tx, g.tenantId, g.actor, "personal_link.issue", { type: "Congregant", id: c.id });
      return { url: l.url };
    });
  });
}

export async function revokeLinksAction(congregantId: string) {
  return run(async () => {
    const g = await requireGabbai();
    await withContext(g.ctx, async (tx) => {
      await revokeLinks(tx, uuid.parse(congregantId));
      await audit(tx, g.tenantId, g.actor, "personal_link.revoke_all", { type: "Congregant", id: congregantId });
    });
  }, "כל הקישורים האישיים של הכרטיס בוטלו.");
}

export async function updateGeneralSettingsAction(input: { name: string }) {
  return run(async () => {
    const g = await requireGabbai();
    if (!input.name.trim()) throw new DomainError("name_required", "יש להזין שם.");
    await withContext(g.ctx, async (tx) => {
      await tx.tenant.update({ where: { id: g.tenantId }, data: { name: input.name.trim() } });
      await audit(tx, g.tenantId, g.actor, "tenant.settings.general");
    });
    revalidatePath("/settings");
  }, "נשמר.");
}

const reminderPolicy = z.object({
  enabled: z.boolean(),
  firstDelayDays: z.number().int().min(0).max(365),
  intervalDays: z.number().int().min(1).max(365),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  skipHolidays: z.boolean(),
  template: z.string().max(700).nullable(),
});

/** The gabbai decides whether automatic reminders run, and exactly when and how. */
export async function updateReminderPolicyAction(input: z.infer<typeof reminderPolicy>) {
  return run(async () => {
    const g = await requireGabbai();
    const p = reminderPolicy.parse(input);
    if (p.enabled && p.days.length === 0) throw new DomainError("no_days", "יש לבחור לפחות יום אחד לשליחה, או לכבות תזכורות אוטומטיות.");
    const template = p.template?.trim() ? p.template.trim() : null;
    if (template) {
      const err = validateTemplate(template);
      if (err) throw new DomainError("bad_template", err);
    }
    await withContext(g.ctx, async (tx) => {
      await tx.tenant.update({
        where: { id: g.tenantId },
        data: {
          remindersEnabled: p.enabled,
          reminderFirstDelayDays: p.firstDelayDays,
          reminderIntervalDays: p.intervalDays,
          reminderDays: [...new Set(p.days)].sort(),
          reminderHour: p.hour,
          reminderMinute: p.minute,
          reminderSkipHolidays: p.skipHolidays,
          reminderTemplate: template,
        },
      });
      await rescheduleAfterPolicyChange(tx);
      await audit(tx, g.tenantId, g.actor, "tenant.settings.reminders", undefined, { ...p, template: template ? "custom" : "default" });
    });
    revalidatePath("/settings");
    revalidatePath("/reminders");
  }, input.enabled ? "מדיניות התזכורות נשמרה. תזכורות שתוזמנו יתוזמנו מחדש לפי ההגדרות החדשות." : "תזכורות אוטומטיות כובו. אפשר עדיין לשלוח תזכורת ידנית.");
}

export async function updateBehaviourSettingsAction(input: Partial<TenantSettings>) {
  return run(async () => {
    const g = await requireGabbai();
    const next = tenantSettingsSchema.parse(input);
    await withContext(g.ctx, async (tx) => {
      await tx.tenant.update({ where: { id: g.tenantId }, data: { settings: next } });
      await audit(tx, g.tenantId, g.actor, "tenant.settings.behaviour", undefined, next);
    });
    revalidatePath("/settings");
  }, "ההגדרות נשמרו.");
}

export async function sendReminderNowAction(congregantId: string, overrideSoft: boolean, clientOpId: string) {
  return run(async () => {
    const g = await requireGabbai();
    const r = await sendReminderNow(g.ctx, { congregantId: uuid.parse(congregantId), overrideSoft, clientOpId: opId.parse(clientOpId), requestedBy: g.userId });
    revalidatePath(`/congregants/${congregantId}`);
    revalidatePath("/reminders");
    if (r.status === "sent" || r.status === "already_requested") return r;
    throw new DomainError("not_sent", r.status === "unknown" ? "לא ידוע אם ההודעה נמסרה. היא לא תישלח שוב אוטומטית." : `התזכורת לא נשלחה (${r.skipReason ?? r.status}).`);
  }, "התזכורת נשלחה.");
}

export async function bulkReminderPreviewAction() {
  return run(async () => {
    const g = await requireGabbai();
    const p = await bulkReminderPreview(g.ctx);
    return { eligible: p.eligible, skipped: p.skipped };
  });
}

export async function bulkReminderSendAction(clientOpId: string) {
  return run(async () => {
    const g = await requireGabbai();
    const r = await sendBulkRemindersNow(g.ctx, { clientOpId: opId.parse(clientOpId), requestedBy: g.userId });
    if (inlineJobs()) after(() => dispatchDueFor(g.tenantId));
    revalidatePath("/reminders");
    return r;
  });
}

export async function cancelReminderAction(messageId: string) {
  return run(async () => {
    const g = await requireGabbai();
    await cancelScheduledReminder(g.ctx, uuid.parse(messageId), g.userId);
    revalidatePath("/reminders");
  }, "התזכורת בוטלה.");
}

/** Used when automatic credit application is off: the gabbai applies a card's credit explicitly. */
export async function applyCreditAction(congregantId: string) {
  return run(async () => {
    const g = await requireGabbai();
    await withContext(g.ctx, async (tx) => {
      const id = uuid.parse(congregantId);
      await lockCard(tx, g.tenantId, id);
      const created = await applyAvailableCredit(tx, g.tenantId, id, { createdBy: g.userId });
      await audit(tx, g.tenantId, g.actor, "credit.apply", { type: "Congregant", id }, { allocations: created.length });
    });
    revalidatePath(`/congregants/${congregantId}`);
  }, "הזכות הוחלה על הנדרים הפתוחים.");
}

/** The synagogue connects its own receiving account (see src/server/integrations/connect.ts). */
export async function connectIntegrationAction(input: ConnectInput) {
  return run(async () => {
    const g = await requireGabbai();
    await withContext(g.ctx, (tx) => connectIntegration(tx, g.tenantId, g.actor, input));
    revalidatePath("/settings");
  }, "החיבור נשמר.");
}

export async function disconnectIntegrationAction(kind: "payment" | "messaging") {
  return run(async () => {
    const g = await requireGabbai();
    await withContext(g.ctx, (tx) => disconnectIntegration(tx, g.tenantId, g.actor, kind));
    revalidatePath("/settings");
  }, "החיבור נותק. תשלומים שכבר התחילו ימשיכו להיקלט.");
}

export async function supportGrantAction(input: { adminEmail: string; scope: "read_ledger" | "read_integrations"; hours: number; reason: string }) {
  return run(async () => {
    const g = await requireGabbai();
    const hours = z.number().int().min(1).max(72).parse(input.hours);
    if (!input.reason.trim()) throw new DomainError("reason_required", "יש לציין את מטרת הגישה.");
    const admin = await prisma.user.findUnique({ where: { email: input.adminEmail.trim().toLowerCase() } });
    if (!admin || admin.platformRole !== "admin") throw new DomainError("not_admin", "הכתובת אינה של צוות התמיכה.");
    await withContext(g.ctx, async (tx) => {
      const grant = await tx.supportGrant.create({
        data: { tenantId: g.tenantId, grantedBy: g.userId, granteeUserId: admin.id, scope: input.scope, reason: input.reason.trim(), expiresAt: new Date(Date.now() + hours * 3600_000) },
      });
      await audit(tx, g.tenantId, g.actor, "support_grant.create", { type: "SupportGrant", id: grant.id }, { scope: input.scope, hours });
    });
    revalidatePath("/settings");
  }, "גישת התמיכה ניתנה לזמן מוגבל.");
}

export async function revokeSupportGrantAction(id: string) {
  return run(async () => {
    const g = await requireGabbai();
    await withContext(g.ctx, async (tx) => {
      await tx.supportGrant.updateMany({ where: { id: uuid.parse(id), revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, g.tenantId, g.actor, "support_grant.revoke", { type: "SupportGrant", id });
    });
    revalidatePath("/settings");
  }, "הגישה בוטלה.");
}

export async function importPreviewAction(csv: string, map: ColumnMap) {
  return run(async () => {
    const g = await requireGabbai();
    if (csv.length > 2_000_000) throw new DomainError("too_large", "הקובץ גדול מדי (עד 2MB).");
    return withContext(g.ctx, (tx) => previewCongregantImport(tx, csv, map));
  });
}

export async function importCommitAction(csv: string, map: ColumnMap) {
  return run(async () => {
    const g = await requireGabbai();
    if (csv.length > 2_000_000) throw new DomainError("too_large", "הקובץ גדול מדי (עד 2MB).");
    const r = await withContext(g.ctx, (tx) => commitCongregantImport(tx, g.tenantId, g.actor, csv, map), { timeout: 120_000 });
    revalidatePath("/congregants");
    return r;
  }, "הייבוא הושלם.");
}

export async function pledgeImportPreviewAction(csv: string, map: PledgeColumnMap) {
  return run(async () => {
    const g = await requireGabbai();
    if (csv.length > 2_000_000) throw new DomainError("too_large", "הקובץ גדול מדי (עד 2MB).");
    return withContext(g.ctx, (tx) => previewPledgeImport(tx, csv, map));
  });
}

export async function pledgeImportCommitAction(csv: string, map: PledgeColumnMap) {
  return run(async () => {
    const g = await requireGabbai();
    if (csv.length > 2_000_000) throw new DomainError("too_large", "הקובץ גדול מדי (עד 2MB).");
    const r = await withContext(g.ctx, (tx) => commitPledgeImport(tx, g.tenantId, g.actor, csv, map), { timeout: 120_000 });
    revalidatePath("/congregants");
    return r;
  }, "הנדרים יובאו.");
}

export async function reconcileReportAction(csv: string, map: ReconColumnMap) {
  return run(async () => {
    const g = await requireGabbai();
    if (csv.length > 5_000_000) throw new DomainError("too_large", "הקובץ גדול מדי (עד 5MB).");
    const r = await withContext(g.ctx, (tx) => reconcileFromReport(tx, g.tenantId, g.actor, csv, map), { timeout: 120_000 });
    revalidatePath("/tasks");
    return r;
  });
}

/** WhatsApp Business one-click connection (Embedded Signup) for this synagogue. */
export async function completeWhatsappSignupAction(input: SignupResult) {
  return run(async () => {
    const g = await requireGabbai();
    const r = await finishEmbeddedSignup(input);
    await withContext(g.ctx, (tx) => storeWhatsappConnection(tx, g.tenantId, g.actor, { ...input, token: r.token, pin: r.pin }));
    revalidatePath("/settings");
    return { templates: r.templates };
  }, "וואטסאפ חובר. תבניות ההודעה נשלחו לאישור של Meta (בדרך כלל דקות עד שעות).");
}
