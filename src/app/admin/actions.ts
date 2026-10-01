"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/session";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/client";
import { run } from "@/server/actions/result";
import { DomainError } from "@/server/errors";
import { onboardTenant, replaceHeadGabbai } from "@/server/admin/tenants";
import { recordManualSubscriptionPayment, setSubscriptionStatus } from "@/server/billing/subscriptions";
import type { SubStatus } from "@/server/billing/policy";
import { withContext } from "@/server/db/context";
import { connectIntegration, disconnectIntegration, type ConnectInput } from "@/server/integrations/connect";
import { finishEmbeddedSignup, storeWhatsappConnection, type SignupResult } from "@/server/integrations/whatsapp-signup";
import { saveReminderDefaults, saveSettingsDefaults, type ReminderDefaults } from "@/server/admin/defaults";
import type { TenantSettings } from "@/server/settings";
import { saveLoginSettings, type LoginSettings } from "@/server/auth/login-settings";
import { EMAIL_NOT_CONFIGURED, emailConfigured } from "@/server/providers/email";

/** Creates (or finds) the gabbai account and sends a password-setup link. The admin never knows the password. */
async function ensureGabbaiUser(email: string, name: string) {
  // The gabbai receives his password link by e-mail – refuse up front rather than promise a link that never comes.
  if (!emailConfigured()) throw new DomainError("email_not_configured", EMAIL_NOT_CONFIGURED, 503);
  const e = z.email().parse(email.trim().toLowerCase());
  let user = await prisma.user.findUnique({ where: { email: e } });
  if (!user) {
    await auth.api.signUpEmail({ body: { email: e, name: name.trim() || e, password: randomBytes(24).toString("base64url") } });
    user = await prisma.user.findUniqueOrThrow({ where: { email: e } });
  }
  // The admin vouches for the address; the reset link sent to it proves control of the inbox.
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  await auth.api.requestPasswordReset({ body: { email: e, redirectTo: "/reset-password" } });
  return user;
}

export async function onboardAction(input: { name: string; city: string; gabbaiEmail: string; gabbaiName: string }) {
  return run(async () => {
    const a = await requireAdmin();
    const u = await ensureGabbaiUser(input.gabbaiEmail, input.gabbaiName);
    const existing = await withContext({ kind: "platform_admin", userId: a.userId }, (tx) => tx.membership.findFirst({ where: { userId: u.id, active: true } }));
    if (existing) throw new DomainError("already_member", "המשתמש כבר גבאי ראשי בבית כנסת אחר.", 409);
    await onboardTenant(a.actor, { name: input.name, city: input.city, headGabbaiUserId: u.id });
    revalidatePath("/admin");
  }, "בית הכנסת נוסף ונשלח לגבאי קישור לבחירת סיסמה.");
}

export async function subscriptionStatusAction(tenantId: string, status: SubStatus) {
  return run(async () => {
    const a = await requireAdmin();
    await setSubscriptionStatus(a.actor, z.uuid().parse(tenantId), status);
    revalidatePath("/admin");
  }, "מצב המנוי עודכן.");
}

export async function manualPaymentAction(tenantId: string, invoiceId: string, reference: string) {
  return run(async () => {
    const a = await requireAdmin();
    await recordManualSubscriptionPayment(a.userId, z.uuid().parse(tenantId), z.uuid().parse(invoiceId), reference);
    revalidatePath("/admin");
  }, "התשלום נרשם.");
}

export async function replaceGabbaiAction(tenantId: string, email: string, name: string, reason: string) {
  return run(async () => {
    const a = await requireAdmin();
    const u = await ensureGabbaiUser(email, name);
    await replaceHeadGabbai(a.actor, z.uuid().parse(tenantId), u.id, reason);
    revalidatePath("/admin");
  }, "הגבאי הוחלף ותועד. נשלח קישור לבחירת סיסמה.");
}

export async function resolveCaseAction(id: string) {
  return run(async () => {
    const a = await requireAdmin();
    await withContext({ kind: "platform_admin", userId: a.userId }, (tx) =>
      tx.supportCase.update({ where: { id: z.uuid().parse(id) }, data: { status: "resolved", resolvedAt: new Date() } }),
    );
    revalidatePath("/admin");
  });
}

// ───────── connecting a synagogue's own accounts on its behalf (credentials write-only, audited) ─────────
export async function adminConnectIntegrationAction(tenantId: string, input: ConnectInput) {
  return run(async () => {
    const a = await requireAdmin();
    const id = z.uuid().parse(tenantId);
    await withContext({ kind: "tenant", tenantId: id, userId: a.userId, actor: a.actor }, (tx) => connectIntegration(tx, id, a.actor, input));
    revalidatePath(`/admin/tenants/${id}`);
    revalidatePath("/admin");
  }, "החיבור נשמר עבור בית הכנסת.");
}

export async function adminDisconnectIntegrationAction(tenantId: string, kind: "payment" | "messaging") {
  return run(async () => {
    const a = await requireAdmin();
    const id = z.uuid().parse(tenantId);
    await withContext({ kind: "tenant", tenantId: id, userId: a.userId, actor: a.actor }, (tx) => disconnectIntegration(tx, id, a.actor, kind));
    revalidatePath(`/admin/tenants/${id}`);
  }, "החיבור נותק.");
}

// ───────── defaults for newly onboarded synagogues ─────────
export async function saveReminderDefaultsAction(input: ReminderDefaults) {
  return run(async () => {
    const a = await requireAdmin();
    await withContext({ kind: "platform_admin", userId: a.userId }, (tx) => saveReminderDefaults(tx, a.userId, input));
    revalidatePath("/admin/defaults");
  }, "ברירות המחדל לתזכורות נשמרו. הן יחולו על בתי כנסת שיצטרפו מעכשיו.");
}

export async function saveSettingsDefaultsAction(input: Partial<TenantSettings>) {
  return run(async () => {
    const a = await requireAdmin();
    await withContext({ kind: "platform_admin", userId: a.userId }, (tx) => saveSettingsDefaults(tx, a.userId, input));
    revalidatePath("/admin/defaults");
  }, "ברירות המחדל נשמרו. הן יחולו על בתי כנסת שיצטרפו מעכשיו.");
}

export async function adminCompleteWhatsappSignupAction(tenantId: string, input: SignupResult) {
  return run(async () => {
    const a = await requireAdmin();
    const id = z.uuid().parse(tenantId);
    const r = await finishEmbeddedSignup(input);
    await withContext({ kind: "tenant", tenantId: id, userId: a.userId, actor: a.actor }, (tx) =>
      storeWhatsappConnection(tx, id, a.actor, { ...input, token: r.token, pin: r.pin }),
    );
    revalidatePath(`/admin/tenants/${id}`);
    return { templates: r.templates };
  }, "וואטסאפ חובר עבור בית הכנסת. תבניות ההודעה נשלחו לאישור של Meta.");
}

export async function saveLoginSettingsAction(input: LoginSettings) {
  return run(async () => {
    const a = await requireAdmin();
    await withContext({ kind: "platform_admin", userId: a.userId }, (tx) => saveLoginSettings(tx, a.userId, input));
    revalidatePath("/admin/defaults");
    revalidatePath("/login");
  }, "הגדרות הכניסה נשמרו.");
}
