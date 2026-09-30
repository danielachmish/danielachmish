import type { Tx } from "../db/client";
import type { Actor } from "../db/context";
import { DomainError } from "../errors";
import { encryptJson } from "../crypto";
import { audit } from "../audit";
import { providerDef } from "./catalog";

export type ConnectInput = {
  kind: "payment" | "messaging";
  provider: string;
  externalAccountId: string;
  displayName?: string;
  secrets: Record<string, string>;
  confirmReplace: boolean;
};

/**
 * Connects (or replaces) a synagogue's own payment / messaging account. Used by the head gabbai and by the
 * platform admin on the synagogue's behalf. Credentials are validated against the provider definition,
 * encrypted before storage and never shown again. A replaced account stays as "replaced" so pending
 * transactions still resolve against it.
 */
export async function connectIntegration(tx: Tx, tenantId: string, actor: Actor, input: ConnectInput) {
  const mode = process.env.PROVIDER_MODE ?? "fake";
  const def = providerDef(input.kind, input.provider);
  if (!def) throw new DomainError("provider_unknown", "ספק לא מוכר.");
  if (def.status === "planned")
    throw new DomainError("provider_planned", `החיבור ל-${def.name} עדיין בפיתוח. צריך את תיעוד ה-API של הספק כדי להשלים אותו.`, 409);
  if (!def.modes.includes(mode as "fake")) throw new DomainError("provider_not_allowed", "ספק זה אינו זמין בסביבה הנוכחית.");
  const ext = input.externalAccountId.trim();
  if (!/^[A-Za-z0-9_.:-]{2,100}$/.test(ext)) throw new DomainError("bad_account", `${def.accountLabel} אינו תקין.`);
  const secrets: Record<string, string> = {};
  for (const f of def.fields) {
    const v = input.secrets[f.key]?.trim();
    if (!v) throw new DomainError("missing_field", `חסר: ${f.label}.`);
    if (v.length > 500) throw new DomainError("field_too_long", `${f.label} ארוך מדי.`);
    secrets[f.key] = v;
  }
  const current = await tx.integrationAccount.findFirst({ where: { kind: input.kind, status: { in: ["active", "error"] } } });
  if (current && !input.confirmReplace)
    throw new DomainError("confirm_replace", "כבר קיים חיבור פעיל. החלפת חשבון מקבל מחייבת אישור מפורש.", 409);
  const created = await tx.integrationAccount.create({
    data: {
      tenantId,
      kind: input.kind,
      provider: input.provider,
      environment: mode,
      externalAccountId: ext,
      displayName: input.displayName?.trim() || null,
      encryptedSecrets: Object.keys(secrets).length ? encryptJson(secrets) : null,
      verifiedAt: new Date(),
      verifiedBy: actor.id,
    },
  });
  if (current) await tx.integrationAccount.update({ where: { id: current.id }, data: { status: "replaced", replacedById: created.id } });
  await audit(tx, tenantId, actor, current ? "integration.replace" : "integration.connect", { type: "IntegrationAccount", id: created.id }, {
    kind: input.kind,
    provider: input.provider,
    by: actor.type,
  });
  return created;
}

/** Disconnect: new payments / messages stop; existing transactions keep resolving against the account. */
export async function disconnectIntegration(tx: Tx, tenantId: string, actor: Actor, kind: "payment" | "messaging") {
  const current = await tx.integrationAccount.findFirst({ where: { kind, status: { in: ["active", "error"] } } });
  if (!current) throw new DomainError("not_connected", "אין חיבור פעיל.", 409);
  await tx.integrationAccount.update({ where: { id: current.id }, data: { status: "disabled" } });
  await audit(tx, tenantId, actor, "integration.disconnect", { type: "IntegrationAccount", id: current.id }, { kind, by: actor.type });
}

/** Safe view for screens: never includes credentials. */
export async function integrationStatus(tx: Tx) {
  const rows = await tx.integrationAccount.findMany({
    where: { status: { in: ["active", "error"] } },
    select: { id: true, kind: true, provider: true, environment: true, externalAccountId: true, displayName: true, status: true, lastError: true, verifiedAt: true },
  });
  return { payment: rows.find((r) => r.kind === "payment") ?? null, messaging: rows.find((r) => r.kind === "messaging") ?? null };
}
