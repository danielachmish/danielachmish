import { prisma } from "../db/client";
import { withContext, type DbContext } from "../db/context";
import { randomDigits, randomToken, sha256 } from "../crypto";
import { DomainError } from "../errors";
import { identityProvider } from "../providers/registry";
import { maskPhone } from "../util/phone";
import type { Tx } from "../db/client";
import { tenantSettings } from "../settings";

// Personal link = random token (never contains name, phone or amount). Only its SHA-256 is stored.
// Financial details are shown only after an OTP sent to the card's authorised phone.

const LINK_TTL_DAYS = 30;
const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_15_MIN = 3;
const OTP_MAX_PER_DAY = 10;
const SESSION_TTL_HOURS = 12;

export async function issuePersonalLink(tx: Tx, tenantId: string, congregantId: string, createdBy: string, ttlDays?: number) {
  ttlDays ??= (await tenantSettings(tx, tenantId)).personalLinkDays ?? LINK_TTL_DAYS;
  const token = randomToken();
  await tx.personalLink.create({
    data: { tenantId, congregantId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlDays * 86400_000), createdBy },
  });
  // Token travels in the URL fragment: never sent to the server, never logged, never in Referer.
  return { token, url: `${process.env.APP_BASE_URL}/p#${token}` };
}

export async function revokeLinks(tx: Tx, congregantId: string) {
  await tx.personalLink.updateMany({ where: { congregantId, revokedAt: null }, data: { revokedAt: new Date() } });
}

type LinkRow = { link_id: string; tenant_id: string; congregant_id: string; expires_at: Date; revoked_at: Date | null };

async function resolveLink(token: string): Promise<LinkRow | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const rows = await prisma.$queryRaw<LinkRow[]>`SELECT * FROM resolve_personal_link(${sha256(token)})`;
  const l = rows[0];
  if (!l || l.revoked_at || l.expires_at < new Date()) return null;
  return l;
}

const invalidLink = () => new DomainError("link_invalid", "הקישור אינו בתוקף. אפשר לבקש קישור חדש מהגבאי או מתפריט הוואטסאפ.", 404);

/** Public info for the link landing page: synagogue name and masked phone only. */
export async function linkLanding(token: string) {
  const l = await resolveLink(token);
  if (!l) throw invalidLink();
  return withContext({ kind: "system", tenantId: l.tenant_id }, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: l.tenant_id } });
    const c = await tx.congregant.findUniqueOrThrow({ where: { id: l.congregant_id } });
    return { synagogueName: tenant.name, maskedPhone: c.phone ? maskPhone(c.phone) : null };
  });
}

export async function requestOtp(token: string) {
  const l = await resolveLink(token);
  if (!l) throw invalidLink();
  const ctx: DbContext = { kind: "system", tenantId: l.tenant_id };
  const { code, phone } = await withContext(ctx, async (tx) => {
    const c = await tx.congregant.findUniqueOrThrow({ where: { id: l.congregant_id } });
    if (!c.phone) throw new DomainError("no_phone", "לכרטיס אין מספר טלפון מאומת. אפשר לפנות לגבאי.", 409);
    const now = Date.now();
    const recent = await tx.otpChallenge.findMany({ where: { linkId: l.link_id, createdAt: { gt: new Date(now - 86400_000) } } });
    if (recent.length >= OTP_MAX_PER_DAY || recent.filter((r) => r.createdAt.getTime() > now - 15 * 60_000).length >= OTP_MAX_PER_15_MIN)
      throw new DomainError("otp_rate_limited", "נשלחו יותר מדי קודים. נסו שוב מאוחר יותר.", 429);
    const code = randomDigits(6);
    await tx.otpChallenge.create({
      data: { tenantId: l.tenant_id, linkId: l.link_id, phone: c.phone, codeHash: sha256(`${l.link_id}:${code}`), expiresAt: new Date(now + OTP_TTL_MIN * 60_000) },
    });
    return { code, phone: c.phone };
  });
  await identityProvider().sendCode({ tenantId: l.tenant_id, phone, code });
  return { maskedPhone: maskPhone(phone) };
}

/** Verifies the code and opens a portal session. Returns the raw session token for an httpOnly cookie. */
export async function verifyOtp(token: string, code: string) {
  const l = await resolveLink(token);
  if (!l) throw invalidLink();
  const bad = new DomainError("otp_invalid", "הקוד שגוי או שפג תוקפו. אפשר לבקש קוד חדש.", 400);
  return withContext({ kind: "system", tenantId: l.tenant_id }, async (tx) => {
    const ch = await tx.otpChallenge.findFirst({ where: { linkId: l.link_id, consumedAt: null }, orderBy: { createdAt: "desc" } });
    if (!ch || ch.expiresAt < new Date() || ch.attempts >= OTP_MAX_ATTEMPTS) throw bad;
    // Atomic attempt counter (concurrent guesses cannot exceed the limit).
    const bumped = await tx.$queryRaw<{ attempts: number }[]>`
      UPDATE "OtpChallenge" SET attempts = attempts + 1 WHERE id = ${ch.id}::uuid AND attempts < ${OTP_MAX_ATTEMPTS} RETURNING attempts`;
    if (bumped.length === 0 || !/^\d{6}$/.test(code) || sha256(`${l.link_id}:${code}`) !== ch.codeHash) {
      return { ok: false as const, error: bad };
    }
    await tx.otpChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } });
    const sessionToken = randomToken();
    await tx.portalSession.create({
      data: {
        tenantId: l.tenant_id,
        linkId: l.link_id,
        phone: ch.phone,
        tokenHash: sha256(sessionToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600_000),
      },
    });
    return { ok: true as const, sessionToken, maxAgeSeconds: SESSION_TTL_HOURS * 3600 };
  }).then((r) => {
    if (!r.ok) throw r.error; // thrown after commit so the attempt counter persists
    return r;
  });
}

export type PortalIdentity = { tenantId: string; congregantIds: string[]; primaryCongregantId: string; phone: string; sessionId: string };

/** Resolves the portal cookie to the cards this verified phone may see (link card + explicit family permissions). */
export async function portalIdentity(sessionToken: string | undefined): Promise<PortalIdentity | null> {
  if (!sessionToken || !/^[A-Za-z0-9_-]{20,100}$/.test(sessionToken)) return null;
  const rows = await prisma.$queryRaw<{ session_id: string; tenant_id: string; link_id: string; phone: string; expires_at: Date }[]>`
    SELECT * FROM resolve_portal_session(${sha256(sessionToken)})`;
  const s = rows[0];
  if (!s || s.expires_at < new Date()) return null;
  return withContext({ kind: "system", tenantId: s.tenant_id }, async (tx) => {
    const link = await tx.personalLink.findUnique({ where: { id: s.link_id } });
    if (!link || link.revokedAt) return null;
    const card = await tx.congregant.findUnique({ where: { id: link.congregantId } });
    // Card phone changed since the code was sent → session no longer valid.
    if (!card || card.phone !== s.phone) return null;
    const family = await tx.contactPermission.findMany({ where: { phone: s.phone, revokedAt: null, relation: "family" } });
    const ids = [...new Set([link.congregantId, ...family.map((f) => f.congregantId)])];
    return { tenantId: s.tenant_id, congregantIds: ids, primaryCongregantId: link.congregantId, phone: s.phone, sessionId: s.session_id };
  });
}

export const portalCtx = (p: PortalIdentity): DbContext & { tenantId: string } => ({
  kind: "portal",
  tenantId: p.tenantId,
  congregantIds: p.congregantIds,
  actor: { type: "congregant", id: p.primaryCongregantId },
});
