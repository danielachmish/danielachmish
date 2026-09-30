import type { Tx } from "../db/client";
import type { Actor } from "../db/context";
import { parseCsv, toCsv } from "../util/csv";
import { sha256 } from "../crypto";
import { DomainError } from "../errors";
import { createCongregant } from "./congregants";
import { createPledge } from "../ledger/engine";
import { parseShekelsToAgorot, agorotToPlain } from "../money";
import { displayPhone, normalizePhone } from "../util/phone";
import { loadCard } from "../ledger/balance";
import { audit } from "../audit";

export type ColumnMap = { firstName: number; lastName: number; phone?: number; externalRef?: number; openingBalance?: number; date?: number };
export type RowResult = { row: number; ok: boolean; error?: string; data?: Record<string, string | null> };

export function parseDate(s: string | undefined | null): Date | null {
  if (!s?.trim()) return null;
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (m) return new Date(Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!));
  return null;
}

/** Validates every row without writing. Never merges by name: existing cards match only by external id. */
export async function previewCongregantImport(tx: Tx, csvText: string, map: ColumnMap, hasHeader = true) {
  const rows = parseCsv(csvText);
  const body = hasHeader ? rows.slice(1) : rows;
  const refs = new Set<string>();
  const results: RowResult[] = [];
  for (let i = 0; i < body.length; i++) {
    const r = body[i]!;
    const get = (idx?: number) => (idx === undefined || idx < 0 ? undefined : r[idx]?.trim());
    const firstName = get(map.firstName);
    const lastName = get(map.lastName) ?? "";
    const phoneRaw = get(map.phone);
    const externalRef = get(map.externalRef) || null;
    const obRaw = get(map.openingBalance);
    const errors: string[] = [];
    if (!firstName) errors.push("חסר שם פרטי");
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (phoneRaw && !phone) errors.push("טלפון לא תקין");
    let ob: number | null = null;
    if (obRaw && obRaw !== "0") {
      try {
        ob = parseShekelsToAgorot(obRaw);
      } catch {
        errors.push("יתרת פתיחה לא תקינה");
      }
    }
    const date = get(map.date);
    if (date && !parseDate(date)) errors.push("תאריך לא תקין (YYYY-MM-DD או DD/MM/YYYY)");
    if (externalRef) {
      if (refs.has(externalRef)) errors.push("מזהה כפול בקובץ");
      refs.add(externalRef);
      if (await tx.congregant.findFirst({ where: { externalRef } })) errors.push("מזהה כבר קיים במערכת");
    }
    results.push({
      row: i + (hasHeader ? 2 : 1),
      ok: errors.length === 0,
      error: errors.join("; ") || undefined,
      data: { firstName: firstName ?? null, lastName, phone, externalRef, openingBalanceAgorot: ob === null ? null : String(ob), date: date ?? null },
    });
  }
  return { fileHash: sha256(csvText), results, validCount: results.filter((r) => r.ok).length };
}

export async function commitCongregantImport(tx: Tx, tenantId: string, actor: Actor, csvText: string, map: ColumnMap, hasHeader = true) {
  const preview = await previewCongregantImport(tx, csvText, map, hasHeader);
  if (await tx.importBatch.findUnique({ where: { tenantId_kind_fileHash: { tenantId, kind: "congregants", fileHash: preview.fileHash } } }))
    throw new DomainError("already_imported", "הקובץ הזה כבר יובא בעבר.", 409);
  if (preview.results.some((r) => !r.ok)) throw new DomainError("import_has_errors", "יש שורות עם שגיאות. יש לתקן את הקובץ ולנסות שוב.", 422);
  await tx.importBatch.create({ data: { tenantId, kind: "congregants", fileHash: preview.fileHash, rowCount: preview.results.length, createdBy: actor.id } });
  for (const r of preview.results) {
    const d = r.data!;
    const c = await createCongregant(tx, tenantId, actor, { firstName: d.firstName!, lastName: d.lastName ?? "", phone: d.phone, externalRef: d.externalRef });
    if (d.openingBalanceAgorot) {
      await createPledge(tx, tenantId, actor, {
        congregantId: c.id,
        kind: "opening_balance",
        amountAgorot: Number(d.openingBalanceAgorot),
        pledgeDate: parseDate(d.date) ?? new Date(new Date().toISOString().slice(0, 10)),
        description: "יתרת פתיחה",
      });
    }
  }
  await audit(tx, tenantId, actor, "import.congregants", undefined, { rows: preview.results.length });
  return { imported: preview.results.length };
}

export async function exportBalancesCsv(tx: Tx) {
  const cs = await tx.congregant.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  const rows: unknown[][] = [["מזהה", "שם פרטי", "שם משפחה", "טלפון", "חוב פתוח", "זכות", "ממתין לאישור"]];
  for (const c of cs) {
    const s = (await loadCard(tx, c.id)).summary;
    rows.push([
      c.externalRef ?? c.id,
      c.firstName,
      c.lastName,
      displayPhone(c.phone),
      agorotToPlain(s.debtAgorot),
      agorotToPlain(s.creditAgorot),
      agorotToPlain(s.pendingExternalAgorot),
    ]);
  }
  return toCsv(rows);
}

/** Full movement export: pledges, corrections, payments, refunds and allocations – enough to explain any balance. */
export async function exportLedgerCsv(tx: Tx) {
  const cs = await tx.congregant.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  const rows: unknown[][] = [["כרטיס", "שם", "סוג תנועה", "מזהה", "תאריך", "סכום", "נדר", "תשלום", "פרטים"]];
  for (const c of cs) {
    const name = `${c.firstName} ${c.lastName}`;
    const card = await loadCard(tx, c.id);
    for (const p of card.pledges) {
      rows.push([c.id, name, p.kind === "opening_balance" ? "יתרת פתיחה" : "נדר", p.id, p.pledgeDate.toISOString().slice(0, 10), agorotToPlain(p.amountAgorot), p.id, "", p.description ?? ""]);
      for (const a of p.adjustments) rows.push([c.id, name, "תיקון", a.id, a.createdAt.toISOString(), agorotToPlain(a.deltaAgorot), p.id, "", a.reason]);
    }
    for (const pm of card.payments) {
      rows.push([
        c.id,
        name,
        `תשלום (${pm.method}, ${pm.status})`,
        pm.id,
        pm.receivedAt.toISOString(),
        agorotToPlain(pm.amountAgorot),
        "",
        pm.id,
        pm.providerTransactionId ?? pm.reference ?? "",
      ]);
      for (const r of pm.refunds) rows.push([c.id, name, "החזר", r.id, r.createdAt.toISOString(), agorotToPlain(-r.amountAgorot), "", pm.id, r.providerRefundId ?? ""]);
      for (const a of pm.allocations) rows.push([c.id, name, `הקצאה (${a.reason})`, a.id, a.createdAt.toISOString(), agorotToPlain(a.amountAgorot), a.pledgeId, pm.id, ""]);
    }
  }
  return toCsv(rows);
}
