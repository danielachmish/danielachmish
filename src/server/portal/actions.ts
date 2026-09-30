import { withContext } from "../db/context";
import { loadCard, pledgeFigures, paymentFigures } from "../ledger/balance";
import { reportExternalPayment } from "../ledger/engine";
import { notFound } from "../errors";
import { audit } from "../audit";
import { portalCtx, type PortalIdentity } from "./links";
import type { Tx } from "../db/client";
import { DomainError } from "../errors";
import { parseSettings, tenantSettings } from "../settings";

export async function portalOverview(p: PortalIdentity, congregantId = p.primaryCongregantId) {
  if (!p.congregantIds.includes(congregantId)) throw notFound("הכרטיס");
  return withContext(portalCtx(p), async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: p.tenantId } });
    const c = await tx.congregant.findUnique({ where: { id: congregantId } });
    if (!c) throw notFound("הכרטיס");
    const card = await loadCard(tx, congregantId);
    const others = await tx.congregant.findMany({ where: { id: { in: p.congregantIds } }, select: { id: true, firstName: true, lastName: true } });
    const openTasks = await tx.task.count({ where: { congregantId, status: "open", kind: { in: ["inquiry", "external_payment"] } } });
    return {
      options: parseSettings(tenant.settings),
      synagogueName: tenant.name,
      name: `${c.firstName} ${c.lastName}`,
      optedOut: c.messagingOptOut,
      summary: card.summary,
      cards: others,
      openTasks,
      pledges: card.pledges.map((pl) => ({
        id: pl.id,
        kind: pl.kind,
        date: pl.pledgeDate,
        dueDate: pl.dueDate,
        description: pl.description ?? pl.category,
        ...pledgeFigures(pl),
      })),
      payments: card.payments.map((pm) => ({
        id: pm.id,
        method: pm.method,
        status: pm.status,
        amountAgorot: pm.amountAgorot,
        receivedAt: pm.receivedAt,
        ...paymentFigures(pm),
      })),
    };
  });
}

export async function portalReportPayment(
  p: PortalIdentity,
  input: { congregantId: string; amountAgorot: number; method: "cash" | "transfer" | "check"; reference?: string; note?: string; clientOpId: string },
) {
  if (!p.congregantIds.includes(input.congregantId)) throw notFound("הכרטיס");
  return withContext(portalCtx(p), async (tx) => {
    if (!(await tenantSettings(tx, p.tenantId)).portalReportExternalPayment)
      throw new DomainError("report_disabled", "דיווח על תשלום אינו זמין כאן. אפשר לפנות לגבאי.", 409);
    return reportExternalPayment(tx, p.tenantId, { type: "congregant", id: input.congregantId }, { ...input, approveNow: false });
  });
}

export async function openInquiry(tx: Tx, tenantId: string, congregantId: string, text: string, source: string) {
  const existing = await tx.task.findFirst({ where: { congregantId, kind: "inquiry", status: "open" } });
  if (existing) return existing;
  return tx.task.create({
    data: { tenantId, kind: "inquiry", congregantId, summary: "בקשת בירור חוב", details: { text: text.slice(0, 1000), source }, pausesReminders: true },
  });
}

export async function portalInquiry(p: PortalIdentity, congregantId: string, text: string) {
  if (!p.congregantIds.includes(congregantId)) throw notFound("הכרטיס");
  return withContext(portalCtx(p), async (tx) => {
    if (!(await tenantSettings(tx, p.tenantId)).portalInquiry) throw new DomainError("inquiry_disabled", "פנייה לבירור אינה זמינה כאן. אפשר לפנות לגבאי.", 409);
    return openInquiry(tx, p.tenantId, congregantId, text, "portal");
  });
}

export async function setOptOut(tx: Tx, tenantId: string, congregantId: string, source: string, actorType: "congregant" | "gabbai") {
  await tx.congregant.update({ where: { id: congregantId }, data: { messagingOptOut: true, messagingOptOutAt: new Date() } });
  await tx.consent.create({ data: { tenantId, congregantId, channel: "whatsapp", granted: false, source } });
  await tx.outboundMessage.updateMany({
    where: { congregantId, status: "scheduled", kind: "reminder" },
    data: { status: "skipped", skipReason: "opted_out" },
  });
  await audit(tx, tenantId, { type: actorType, id: congregantId }, "messaging.opt_out", { type: "Congregant", id: congregantId }, { source });
}

export async function portalOptOut(p: PortalIdentity, congregantId: string) {
  if (!p.congregantIds.includes(congregantId)) throw notFound("הכרטיס");
  return withContext(portalCtx(p), (tx) => setOptOut(tx, p.tenantId, congregantId, "portal", "congregant"));
}
