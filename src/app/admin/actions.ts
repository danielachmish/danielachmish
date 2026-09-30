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

/** Creates (or finds) the gabbai account and sends a password-setup link. The admin never knows the password. */
async function ensureGabbaiUser(email: string, name: string) {
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
