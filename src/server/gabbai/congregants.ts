import type { Tx } from "../db/client";
import type { Actor } from "../db/context";
import { normalizePhone } from "../util/phone";
import { DomainError, notFound } from "../errors";
import { audit } from "../audit";
import { cardSummary } from "../ledger/balance";

export type CongregantInput = {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  externalRef?: string | null;
};

function clean(input: CongregantInput) {
  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim() ?? "";
  if (!firstName) throw new DomainError("name_required", "יש להזין שם פרטי.");
  let phone: string | null = null;
  if (input.phone?.trim()) {
    phone = normalizePhone(input.phone);
    if (!phone) throw new DomainError("phone_invalid", "מספר הטלפון אינו תקין. לדוגמה: 050-1234567");
  }
  return {
    firstName,
    lastName,
    phone,
    email: input.email?.trim() || null,
    notes: input.notes?.trim() || null,
    externalRef: input.externalRef?.trim() || null,
  };
}

export async function createCongregant(tx: Tx, tenantId: string, actor: Actor, input: CongregantInput) {
  const data = clean(input);
  const c = await tx.congregant.create({ data: { tenantId, ...data } });
  if (c.phone) await tx.contactPermission.create({ data: { tenantId, congregantId: c.id, phone: c.phone, relation: "self", grantedBy: actor.id } });
  await audit(tx, tenantId, actor, "congregant.create", { type: "Congregant", id: c.id });
  return c;
}

export async function updateCongregant(tx: Tx, tenantId: string, actor: Actor, id: string, input: CongregantInput) {
  const before = await tx.congregant.findUnique({ where: { id } });
  if (!before) throw notFound("כרטיס המתפלל");
  const data = clean(input);
  const c = await tx.congregant.update({ where: { id }, data });
  if (before.phone !== c.phone) {
    // A phone change invalidates the old authorisation and every personal link.
    await tx.contactPermission.updateMany({ where: { congregantId: id, relation: "self", revokedAt: null }, data: { revokedAt: new Date() } });
    if (c.phone) await tx.contactPermission.create({ data: { tenantId, congregantId: id, phone: c.phone, relation: "self", grantedBy: actor.id } });
    await tx.personalLink.updateMany({ where: { congregantId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit(tx, tenantId, actor, "congregant.update", { type: "Congregant", id }, { phoneChanged: before.phone !== c.phone });
  return c;
}

export async function recordConsent(tx: Tx, tenantId: string, actor: Actor, congregantId: string, granted: boolean) {
  const c = await tx.congregant.findUnique({ where: { id: congregantId } });
  if (!c) throw notFound("כרטיס המתפלל");
  if (granted && !c.phone) throw new DomainError("phone_required", "כדי לשלוח הודעות יש להזין מספר טלפון.");
  await tx.consent.create({ data: { tenantId, congregantId, channel: "whatsapp", granted, source: "gabbai_recorded", recordedBy: actor.id } });
  if (granted && c.messagingOptOut) await tx.congregant.update({ where: { id: congregantId }, data: { messagingOptOut: false, messagingOptOutAt: null } });
  await audit(tx, tenantId, actor, granted ? "consent.granted" : "consent.revoked", { type: "Congregant", id: congregantId });
}

/** Family access is explicit only – never inferred from a shared last name. */
export async function grantFamilyAccess(tx: Tx, tenantId: string, actor: Actor, congregantId: string, phoneInput: string) {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new DomainError("phone_invalid", "מספר הטלפון אינו תקין.");
  const c = await tx.congregant.findUnique({ where: { id: congregantId } });
  if (!c) throw notFound("כרטיס המתפלל");
  await tx.contactPermission.create({ data: { tenantId, congregantId, phone, relation: "family", grantedBy: actor.id } });
  await audit(tx, tenantId, actor, "contact_permission.family_grant", { type: "Congregant", id: congregantId });
}

export async function listCongregants(tx: Tx, search?: string) {
  const q = search?.trim();
  const digits = q?.replace(/\D/g, "").replace(/^0/, "");
  const rows = await tx.congregant.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            ...(digits && digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : undefined,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });
  return Promise.all(rows.map(async (c) => ({ ...c, summary: await cardSummary(tx, c.id) })));
}
