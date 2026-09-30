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
import { cardSummaries } from "../ledger/aggregate";
import { audit } from "../audit";

export type ColumnMap = { firstName: number; lastName: number; phone?: number; externalRef?: number; openingBalance?: number; date?: number };
export type RowResult = { row: number; ok: boolean; error?: string; data?: Record<string, string | null> };

export function parseDate(s: string | undefined | null): Date | null {
  if (!s?.trim()) return null;
  const t = s.trim();
  let y: number, m: number, d: number;
  let mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (mm) [y, m, d] = [+mm[1]!, +mm[2]!, +mm[3]!];
  else if ((mm = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t))) [d, m, y] = [+mm[1]!, +mm[2]!, +mm[3]!];
  else return null;
  // Reject impossible dates (JS would silently roll 31/31 over into a later month).
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2200) return null;
  return dt;
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
  const sums = await cardSummaries(tx);
  for (const c of cs) {
    const s = sums.get(c.id)!;
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

export async function exportReportsCsv(tx: Tx) {
  const { monthlyReport, debtAging, byCategory } = await import("../ledger/aggregate");
  const rows: unknown[][] = [["גבייה לפי חודשים"], ["חודש", "נדרים חדשים", "נגבה", "החזרים", "מספר תשלומים"]];
  for (const m of await monthlyReport(tx, 24))
    rows.push([m.month, agorotToPlain(m.pledgedAgorot), agorotToPlain(m.collectedAgorot), agorotToPlain(m.refundedAgorot), m.payments]);
  rows.push([], ["גיל חובות"], ["טווח (ימים)", "חוב פתוח", "מספר נדרים"]);
  for (const b of await debtAging(tx)) rows.push([b.bucket, agorotToPlain(b.outstandingAgorot), b.pledges]);
  rows.push([], ["לפי סוג נדר"], ["סוג", "נדרים", "סה״כ", "שולם", "פתוח"]);
  for (const c of await byCategory(tx)) rows.push([c.category, c.pledges, agorotToPlain(c.pledgedAgorot), agorotToPlain(c.paidAgorot), agorotToPlain(c.openAgorot)]);
  return toCsv(rows);
}

// ───────────── pledges import ─────────────
export type PledgeColumnMap = { match: number; amount: number; date: number; category?: number; description?: number; dueDate?: number };

/** Each row is matched to exactly one card by external id or phone – never by name. */
export async function previewPledgeImport(tx: Tx, csvText: string, map: PledgeColumnMap, hasHeader = true) {
  const rows = parseCsv(csvText);
  const body = hasHeader ? rows.slice(1) : rows;
  const cards = await tx.congregant.findMany({ select: { id: true, externalRef: true, phone: true, firstName: true, lastName: true } });
  const byRef = new Map(cards.filter((c) => c.externalRef).map((c) => [c.externalRef!, c]));
  const byPhone = new Map<string, typeof cards>();
  for (const c of cards) if (c.phone) byPhone.set(c.phone, [...(byPhone.get(c.phone) ?? []), c]);
  const results: RowResult[] = [];
  for (let i = 0; i < body.length; i++) {
    const r = body[i]!;
    const get = (idx?: number) => (idx === undefined || idx < 0 ? undefined : r[idx]?.trim());
    const errors: string[] = [];
    const key = get(map.match) ?? "";
    let card = byRef.get(key);
    if (!card) {
      const phone = normalizePhone(key);
      const hits = phone ? byPhone.get(phone) ?? [] : [];
      if (hits.length > 1) errors.push("הטלפון שייך ליותר מכרטיס אחד – יש להשתמש במזהה");
      card = hits.length === 1 ? hits[0] : undefined;
    }
    if (!card && !errors.length) errors.push("לא נמצא כרטיס עם המזהה או הטלפון");
    let amount: number | null = null;
    try {
      amount = parseShekelsToAgorot(get(map.amount) ?? "");
    } catch {
      errors.push("סכום לא תקין");
    }
    const date = parseDate(get(map.date));
    if (!date) errors.push("תאריך לא תקין");
    const due = get(map.dueDate);
    if (due && !parseDate(due)) errors.push("מועד תשלום לא תקין");
    results.push({
      row: i + (hasHeader ? 2 : 1),
      ok: errors.length === 0,
      error: errors.join("; ") || undefined,
      data: {
        congregantId: card?.id ?? null,
        name: card ? `${card.firstName} ${card.lastName}` : null,
        amountAgorot: amount === null ? null : String(amount),
        date: get(map.date) ?? null,
        dueDate: due ?? null,
        category: get(map.category) ?? null,
        description: get(map.description) ?? null,
      },
    });
  }
  return { fileHash: sha256(csvText), results, validCount: results.filter((r) => r.ok).length };
}

export async function commitPledgeImport(tx: Tx, tenantId: string, actor: Actor, csvText: string, map: PledgeColumnMap, hasHeader = true) {
  const preview = await previewPledgeImport(tx, csvText, map, hasHeader);
  if (await tx.importBatch.findUnique({ where: { tenantId_kind_fileHash: { tenantId, kind: "pledges", fileHash: preview.fileHash } } }))
    throw new DomainError("already_imported", "הקובץ הזה כבר יובא בעבר.", 409);
  if (preview.results.some((r) => !r.ok)) throw new DomainError("import_has_errors", "יש שורות עם שגיאות. יש לתקן את הקובץ ולנסות שוב.", 422);
  await tx.importBatch.create({ data: { tenantId, kind: "pledges", fileHash: preview.fileHash, rowCount: preview.results.length, createdBy: actor.id } });
  for (const r of preview.results) {
    const d = r.data!;
    await createPledge(tx, tenantId, actor, {
      congregantId: d.congregantId!,
      amountAgorot: Number(d.amountAgorot),
      pledgeDate: parseDate(d.date)!,
      dueDate: parseDate(d.dueDate),
      category: d.category,
      description: d.description,
      clientOpId: `import-${preview.fileHash.slice(0, 16)}-${r.row}`,
    });
  }
  await audit(tx, tenantId, actor, "import.pledges", undefined, { rows: preview.results.length });
  return { imported: preview.results.length };
}

// ───────────── reconciliation from a provider report file ─────────────
export type ReconColumnMap = { transactionId: number; amount: number; type?: number; status?: number };

/**
 * Manual reconciliation when the provider has no listing API: upload the provider's transactions report and
 * compare it with what the system recorded for the active payment account. Differences open a task.
 * Nothing here changes balances – only verified callbacks / status queries do.
 */
export async function reconcileFromReport(tx: Tx, tenantId: string, actor: Actor, csvText: string, map: ReconColumnMap, hasHeader = true) {
  const acct = await tx.integrationAccount.findFirst({ where: { kind: "payment", status: { in: ["active", "error"] } } });
  if (!acct) throw new DomainError("no_payment_integration", "אין חשבון סליקה מחובר.", 409);
  const rows = parseCsv(csvText);
  const body = hasHeader ? rows.slice(1) : rows;
  const diffs: { row: number; transactionId: string; problem: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < body.length; i++) {
    const r = body[i]!;
    const txId = r[map.transactionId]?.trim() ?? "";
    const row = i + (hasHeader ? 2 : 1);
    if (!txId) continue;
    const typeText = (map.type !== undefined ? r[map.type] : "")?.toLowerCase() ?? "";
    const statusText = (map.status !== undefined ? r[map.status] : "")?.toLowerCase() ?? "";
    if (/fail|declin|נכשל|נדחה|j5|אישור מסגרת/.test(statusText)) continue; // not a completed charge
    let amount: number;
    try {
      amount = parseShekelsToAgorot((r[map.amount] ?? "").replace(/^-/, ""));
    } catch {
      diffs.push({ row, transactionId: txId, problem: "סכום לא קריא בדוח" });
      continue;
    }
    const isRefund = /refund|החזר|זיכוי/.test(typeText) || (r[map.amount] ?? "").trim().startsWith("-");
    if (isRefund) {
      const refund = await tx.refund.findFirst({ where: { providerRefundId: txId, providerAccountId: acct.externalAccountId } });
      if (!refund) diffs.push({ row, transactionId: txId, problem: "החזר בדוח שלא נקלט במערכת" });
      else if (refund.amountAgorot !== amount) diffs.push({ row, transactionId: txId, problem: "סכום ההחזר שונה" });
      continue;
    }
    seen.add(txId);
    const p = await tx.payment.findFirst({ where: { providerTransactionId: txId, providerAccountId: acct.externalAccountId } });
    if (!p) diffs.push({ row, transactionId: txId, problem: "חיוב בדוח שלא נקלט במערכת" });
    else if (p.amountAgorot !== amount) diffs.push({ row, transactionId: txId, problem: "הסכום שונה מהרשום במערכת" });
  }
  const fileHash = sha256(csvText);
  await tx.importBatch.createMany({ data: [{ tenantId, kind: "reconciliation", fileHash, rowCount: body.length, createdBy: actor.id }], skipDuplicates: true });
  if (diffs.length)
    await tx.task.create({
      data: { tenantId, kind: "reconciliation", summary: `התאמה מול דוח הסליקה: ${diffs.length} הבדלים`, details: { diffs: diffs.slice(0, 200), fileHash } },
    });
  await audit(tx, tenantId, actor, "reconciliation.report", undefined, { rows: body.length, diffs: diffs.length });
  return { checked: body.length, diffs, matched: seen.size - diffs.filter((d) => d.problem.startsWith("חיוב") || d.problem.startsWith("הסכום")).length };
}
