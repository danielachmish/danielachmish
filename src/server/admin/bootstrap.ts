import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db/client";
import { auth } from "../auth/auth";
import { emailConfigured } from "../providers/email";

/**
 * First platform admin for a new deployment (ADMIN_EMAIL). Idempotent: creates the account once, or promotes
 * an existing account with that address; does nothing when it is already an admin. The admin never receives a
 * password from us – a "choose a password" link is e-mailed (if e-mail is not configured yet, /forgot-password
 * works later). Returns what happened, for the build log (no secrets).
 */
export async function bootstrapAdmin(emailInput: string, name = "מנהל המערכת"): Promise<"created" | "promoted" | "unchanged" | "created-no-email" | "promoted-no-email"> {
  const email = z.email().parse(emailInput.trim().toLowerCase());
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.platformRole === "admin") return "unchanged";
  let result: "created" | "promoted";
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { platformRole: "admin", emailVerified: true } });
    result = "promoted";
  } else {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true }, { method: "admin" });
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(randomBytes(24).toString("base64url")) });
    await prisma.user.update({ where: { id: user.id }, data: { platformRole: "admin" } });
    result = "created";
  }
  // Better Auth swallows delivery errors, so check the configuration ourselves to report honestly.
  if (!emailConfigured()) return `${result}-no-email`;
  await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
  return result;
}
