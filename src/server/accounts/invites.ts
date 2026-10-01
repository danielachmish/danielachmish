import { z } from "zod";
import { prisma } from "../db/client";
import { withContext, type DbContext, type Actor } from "../db/context";
import type { Tx } from "../db/client";
import { randomToken, sha256 } from "../crypto";
import { DomainError } from "../errors";
import { audit } from "../audit";
import { auth } from "../auth/auth";
import { sendEmail } from "../providers/email";

// Congregant app accounts (e-mail + password). An account is linked to a card ONLY by accepting a single-use
// invitation the gabbai issued for that card, so nobody can sign up and see someone else's debts.

const INVITE_TTL_DAYS = 14;
export const MIN_PASSWORD = 10;

const invalidInvite = () => new DomainError("invite_invalid", "ההזמנה אינה בתוקף. אפשר לבקש הזמנה חדשה מהגבאי.", 404);

/** New invitation for a card (earlier unused ones are revoked). Returns the raw token once. */
export async function createAppInvite(tx: Tx, tenantId: string, actor: Actor, congregantId: string, opts: { email?: boolean } = {}) {
  const c = await tx.congregant.findUnique({ where: { id: congregantId } });
  if (!c) throw new DomainError("not_found", "הכרטיס לא נמצא.", 404);
  const sentToEmail = opts.email ? c.email?.trim().toLowerCase() || null : null;
  if (opts.email && !sentToEmail) throw new DomainError("no_email", "לכרטיס אין כתובת דוא״ל. אפשר להוסיף כתובת בפרטי המתפלל או לשלוח בוואטסאפ.");
  await tx.appInvite.updateMany({ where: { congregantId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  const token = randomToken();
  const invite = await tx.appInvite.create({
    data: { tenantId, congregantId, tokenHash: sha256(token), sentToEmail, expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000), createdBy: actor.id },
  });
  await audit(tx, tenantId, actor, "account.invite", { type: "congregant", id: congregantId }, { via: opts.email ? "email" : "link" });
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
  // Token travels in the URL fragment (never sent to the server or logged), as with personal links.
  return { inviteId: invite.id, token, url: `${process.env.APP_BASE_URL}/invite#${token}`, card: c, synagogueName: tenant.name, sentToEmail };
}

export function inviteText(firstName: string, synagogueName: string, url: string) {
  return `שלום ${firstName},\n${synagogueName} מזמין אותך לאפליקציה – צפייה בנדרים ובתשלומים ותשלום מאובטח.\nלפתיחת חשבון (בחירת סיסמה):\n${url}\n\nהקישור אישי ובתוקף ל-${INVITE_TTL_DAYS} יום.`;
}

/** Gabbai action: invite by e-mail (to the card's address) or just produce the link (WhatsApp / copy). */
export async function inviteCongregant(g: { ctx: DbContext; tenantId: string; actor: Actor }, congregantId: string, via: "email" | "link") {
  const r = await withContext(g.ctx, (tx) => createAppInvite(tx, g.tenantId, g.actor, congregantId, { email: via === "email" }));
  if (via === "email") {
    await sendEmail({ to: r.sentToEmail!, subject: `הזמנה לאפליקציה – ${r.synagogueName}`, url: r.url, text: inviteText(r.card.firstName, r.synagogueName, r.url) });
  }
  return { url: r.url, text: inviteText(r.card.firstName, r.synagogueName, r.url) };
}

type InviteRow = { invite_id: string; tenant_id: string; congregant_id: string; expires_at: Date; used_at: Date | null; revoked_at: Date | null };

async function resolveInvite(token: string): Promise<InviteRow | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const rows = await prisma.$queryRaw<InviteRow[]>`SELECT * FROM resolve_app_invite(${sha256(token)})`;
  const i = rows[0];
  if (!i || i.used_at || i.revoked_at || i.expires_at < new Date()) return null;
  return i;
}

/** Public info for the invitation page: synagogue, first name and the address to suggest. */
export async function inviteLanding(token: string) {
  const i = await resolveInvite(token);
  if (!i) throw invalidInvite();
  return withContext({ kind: "system", tenantId: i.tenant_id }, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: i.tenant_id }, select: { name: true } });
    const c = await tx.congregant.findUniqueOrThrow({ where: { id: i.congregant_id } });
    const inv = await tx.appInvite.findUniqueOrThrow({ where: { id: i.invite_id } });
    return { synagogueName: tenant.name, firstName: c.firstName, suggestedEmail: inv.sentToEmail ?? c.email ?? "" };
  });
}

/** Links the card to the user and consumes the invitation (atomically; a second use fails). */
async function consume(i: InviteRow, userId: string) {
  await withContext({ kind: "system", tenantId: i.tenant_id }, async (tx) => {
    const claimed = await tx.appInvite.updateMany({ where: { id: i.invite_id, usedAt: null, revokedAt: null }, data: { usedAt: new Date(), usedBy: userId } });
    if (claimed.count === 0) throw invalidInvite();
    const existing = await tx.congregantAccount.findFirst({ where: { congregantId: i.congregant_id, userId, revokedAt: null } });
    if (!existing) {
      await tx.congregantAccount.create({ data: { tenantId: i.tenant_id, congregantId: i.congregant_id, userId, inviteId: i.invite_id } });
    }
    await audit(tx, i.tenant_id, { type: "congregant", id: i.congregant_id }, "account.linked", { type: "congregant", id: i.congregant_id }, { userId });
  });
}

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().transform((e) => e.trim().toLowerCase()),
  password: z.string().min(MIN_PASSWORD, `הסיסמה צריכה להכיל לפחות ${MIN_PASSWORD} תווים.`).max(128),
});

/**
 * New account from an invitation. If the address is the one the invitation was e-mailed to, opening the
 * link proved control of the inbox and the account is ready at once; otherwise a verification e-mail is sent.
 */
export async function acceptInviteWithNewAccount(token: string, input: { name: string; email: string; password: string }) {
  const i = await resolveInvite(token);
  if (!i) throw invalidInvite();
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("invalid_input", parsed.error.issues[0]?.message ?? "פרטים שגויים.");
  const { name, email, password } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } }))
    throw new DomainError("account_exists", "כבר יש חשבון עם כתובת הדוא״ל הזו. בחרו ״יש לי כבר חשבון״ והתחברו.", 409);
  const sentTo = await withContext({ kind: "system", tenantId: i.tenant_id }, (tx) =>
    tx.appInvite.findUniqueOrThrow({ where: { id: i.invite_id }, select: { sentToEmail: true } }),
  );
  const verified = !!sentTo.sentToEmail && sentTo.sentToEmail === email;
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: verified }, { method: "email-password" });
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(password) });
  await consume(i, user.id);
  if (!verified) await auth.api.sendVerificationEmail({ body: { email, callbackURL: "/" } });
  return { needsVerification: !verified };
}

/** Existing (signed-in, verified) user accepts an invitation – e.g. a congregant of a second synagogue. */
export async function acceptInviteForUser(token: string, userId: string) {
  const i = await resolveInvite(token);
  if (!i) throw invalidInvite();
  await consume(i, userId);
}

/** App accounts linked to a card (for the gabbai's card screen). */
export async function cardAccounts(tx: Tx, congregantId: string) {
  const rows = await tx.congregantAccount.findMany({ where: { congregantId, revokedAt: null }, include: { user: { select: { email: true, emailVerified: true } } }, orderBy: { createdAt: "asc" } });
  const pending = await tx.appInvite.findFirst({ where: { congregantId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  return { accounts: rows.map((r) => ({ id: r.id, email: r.user.email, verified: r.user.emailVerified, since: r.createdAt })), pendingInvite: pending ? { sentToEmail: pending.sentToEmail, expiresAt: pending.expiresAt } : null };
}

export async function revokeCongregantAccount(tx: Tx, tenantId: string, actor: Actor, accountId: string) {
  const r = await tx.congregantAccount.updateMany({ where: { id: accountId, revokedAt: null }, data: { revokedAt: new Date(), revokedBy: actor.id } });
  if (r.count === 0) throw new DomainError("not_found", "החיבור לא נמצא.", 404);
  const row = await tx.congregantAccount.findUniqueOrThrow({ where: { id: accountId } });
  await audit(tx, tenantId, actor, "account.revoked", { type: "congregant", id: row.congregantId }, { accountId });
}
