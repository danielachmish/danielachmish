"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { run, type ActionResult } from "@/server/actions/result";
import { DomainError } from "@/server/errors";
import { parseShekelsToAgorot } from "@/server/money";
import { adjustPledge, createPledge, decideExternalPayment, reportExternalPayment } from "@/server/ledger/engine";
import { createCongregant, grantFamilyAccess, recordConsent, updateCongregant, type CongregantInput } from "@/server/gabbai/congregants";
import { commitCongregantImport, parseDate, previewCongregantImport, type ColumnMap } from "@/server/gabbai/import-export";
import { issuePersonalLink, revokeLinks } from "@/server/portal/links";
import { encryptJson } from "@/server/crypto";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db/client";

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

export async function updateSettingsAction(input: { name: string; reminderFirstDelayDays: number; reminderIntervalDays: number }) {
  return run(async () => {
    const g = await requireGabbai();
    if (!input.name.trim()) throw new DomainError("name_required", "יש להזין שם.");
    const first = z.number().int().min(0).max(120).parse(input.reminderFirstDelayDays);
    const interval = z.number().int().min(7).max(365).parse(input.reminderIntervalDays);
    await withContext(g.ctx, async (tx) => {
      await tx.tenant.update({ where: { id: g.tenantId }, data: { name: input.name.trim(), reminderFirstDelayDays: first, reminderIntervalDays: interval } });
      await audit(tx, g.tenantId, g.actor, "tenant.settings", undefined, { first, interval });
    });
    revalidatePath("/settings");
  }, "ההגדרות נשמרו.");
}

/**
 * Connects a payment or messaging account. The environment is fixed by the deployment's PROVIDER_MODE.
 * Credentials are encrypted before they reach the DB. Replacing an account keeps the old one as
 * "replaced" so pending transactions still resolve against their original account.
 */
export async function connectIntegrationAction(input: {
  kind: "payment" | "messaging";
  provider: string;
  externalAccountId: string;
  displayName?: string;
  secrets: Record<string, string>;
  confirmReplace: boolean;
}) {
  return run(async () => {
    const g = await requireGabbai();
    const env = process.env.PROVIDER_MODE ?? "fake";
    const allowed = input.kind === "payment" ? (env === "fake" ? ["fake"] : ["payplus"]) : env === "fake" ? ["fake"] : ["whatsapp_cloud"];
    if (!allowed.includes(input.provider)) throw new DomainError("provider_not_allowed", "ספק זה אינו זמין בסביבה הנוכחית.");
    const ext = input.externalAccountId.trim();
    if (!/^[A-Za-z0-9_.:-]{2,100}$/.test(ext)) throw new DomainError("bad_account", "מזהה החשבון אינו תקין.");
    await withContext(g.ctx, async (tx) => {
      const current = await tx.integrationAccount.findFirst({ where: { kind: input.kind, status: { in: ["active", "error"] } } });
      if (current && !input.confirmReplace)
        throw new DomainError("confirm_replace", "כבר קיים חיבור פעיל. החלפת חשבון מקבל מחייבת אישור מפורש.", 409);
      const created = await tx.integrationAccount.create({
        data: {
          tenantId: g.tenantId,
          kind: input.kind,
          provider: input.provider,
          environment: env,
          externalAccountId: ext,
          displayName: input.displayName?.trim() || null,
          encryptedSecrets: Object.keys(input.secrets).length ? encryptJson(input.secrets) : null,
          verifiedAt: new Date(),
          verifiedBy: g.userId,
        },
      });
      if (current) await tx.integrationAccount.update({ where: { id: current.id }, data: { status: "replaced", replacedById: created.id } });
      await audit(tx, g.tenantId, g.actor, current ? "integration.replace" : "integration.connect", { type: "IntegrationAccount", id: created.id }, {
        kind: input.kind,
        provider: input.provider,
      });
    });
    revalidatePath("/settings");
  }, "החיבור נשמר.");
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
