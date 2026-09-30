import type { Tx } from "../db/client";
import { loadCard, pledgeFigures } from "../ledger/balance";
import { formatILS } from "../money";

const MAX_LINES = 15;
const dateText = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;

/** Cards a phone may see in this synagogue: its own card(s) and cards it was explicitly authorised for. */
export async function cardsForPhone(tx: Tx, phone: string) {
  const own = await tx.congregant.findMany({ where: { phone }, orderBy: { createdAt: "asc" } });
  const perms = await tx.contactPermission.findMany({ where: { phone, revokedAt: null } });
  const extraIds = perms.map((p) => p.congregantId).filter((id) => !own.some((c) => c.id === id));
  const extra = extraIds.length ? await tx.congregant.findMany({ where: { id: { in: extraIds } } }) : [];
  return [...own, ...extra];
}

/** Debt statement for WhatsApp: every open pledge with date, description and what is left. */
export async function debtStatementText(tx: Tx, synagogueName: string, cards: { id: string; firstName: string; lastName: string }[], link: string) {
  const parts: string[] = [];
  let total = 0;
  for (const c of cards) {
    const card = await loadCard(tx, c.id);
    const open = card.pledges.map((p) => ({ p, f: pledgeFigures(p) })).filter((x) => x.f.outstanding > 0);
    total += card.summary.debtAgorot;
    if (cards.length > 1) parts.push(`\n${c.firstName} ${c.lastName}:`);
    if (open.length === 0) parts.push("אין חוב פתוח.");
    for (const { p, f } of open.slice(0, MAX_LINES)) {
      const what = p.description || p.category || (p.kind === "opening_balance" ? "יתרת פתיחה" : "נדר");
      const partial = f.allocated > 0 ? ` (שולם ${formatILS(f.allocated)} מתוך ${formatILS(f.effective)})` : "";
      parts.push(`• ${dateText(p.dueDate ?? p.pledgeDate)} – ${what}: ${formatILS(f.outstanding)}${partial}`);
    }
    if (open.length > MAX_LINES) parts.push(`ועוד ${open.length - MAX_LINES} נדרים – הפירוט המלא בקישור.`);
    if (card.summary.creditAgorot > 0) parts.push(`זכות: ${formatILS(card.summary.creditAgorot)}`);
    if (card.summary.pendingExternalAgorot > 0) parts.push(`ממתין לאישור הגבאי: ${formatILS(card.summary.pendingExternalAgorot)}`);
  }
  if (total === 0) return `אין לך חוב פתוח ב${synagogueName}. תודה!${parts.some((x) => x.startsWith("זכות")) ? "\n" + parts.filter((x) => x.startsWith("זכות")).join("\n") : ""}`;
  return [`החובות שלך ב${synagogueName}:`, ...parts, "", `סה״כ לתשלום: ${formatILS(total)}`, `לתשלום מאובטח (אפשר גם חלקי): ${link}`].join("\n");
}
