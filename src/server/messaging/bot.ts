import { prisma } from "../db/client";
import { systemCtx, withContext } from "../db/context";
import { isUniqueViolation } from "../errors";
import { sha256 } from "../crypto";
import { messagingProvider } from "../providers/registry";
import { enqueue, QUEUES } from "../queue";
import { normalizePhone } from "../util/phone";
import { issuePersonalLink } from "../portal/links";
import { openInquiry, setOptOut } from "../portal/actions";
import type { Tx } from "../db/client";
import { cardsForPhone, debtStatementText } from "./statement";
import { parseSettings, type TenantSettings } from "../settings";

// Fixed menu – no AI. Inbound messages are routed by the synagogue's WhatsApp account, never by the sender alone.
export function menuText(s: Pick<TenantSettings, "portalReportExternalPayment" | "portalInquiry">) {
  return [
    "תפריט:",
    "1 – החובות שלי (פירוט)",
    "2 – לתשלום",
    ...(s.portalReportExternalPayment ? ["3 – שילמתי בדרך אחרת"] : []),
    ...(s.portalInquiry ? ["4 – בירור חוב"] : []),
    "5 – הפסקת תזכורות",
    "אפשר להשיב במספר האפשרות.",
  ].join("\n");
}

export async function receiveMessagingWebhook(providerName: string, headers: Headers, rawBody: string) {
  const provider = messagingProvider(providerName);
  if (!provider.authenticateWebhook(headers, rawBody)) {
    await withContext(systemCtx(), (tx) => tx.unroutedEvent.create({ data: { provider: providerName, reason: "bad_signature", headers: {}, bodyHash: sha256(rawBody) } }));
    return { outcome: "rejected" as const };
  }
  const route = provider.routeWebhook(rawBody);
  const env = process.env.PROVIDER_MODE ?? "fake";
  const acct = route
    ? (await prisma.$queryRaw<{ id: string; tenant_id: string }[]>`
        SELECT * FROM resolve_integration_account('messaging', ${providerName}, ${env}, ${route.externalAccountId})`)[0]
    : undefined;
  if (!acct) {
    await withContext(systemCtx(), (tx) => tx.unroutedEvent.create({ data: { provider: providerName, reason: "unknown_account", headers: {}, bodyHash: sha256(rawBody) } }));
    return { outcome: "unrouted" as const };
  }
  try {
    const ev = await withContext(systemCtx(acct.tenant_id), (tx) =>
      tx.providerEvent.create({
        data: {
          tenantId: acct.tenant_id,
          integrationAccountId: acct.id,
          provider: providerName,
          kind: "whatsapp_inbound",
          dedupeKey: sha256(rawBody),
          payload: JSON.parse(rawBody),
          authenticated: true,
        },
      }),
    );
    await enqueue(QUEUES.providerEvent, { tenantId: acct.tenant_id, eventId: ev.id }, { singletonKey: ev.id });
    return { outcome: "accepted" as const, tenantId: acct.tenant_id, eventId: ev.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { outcome: "duplicate" as const };
    throw e;
  }
}

async function queueReply(tx: Tx, tenantId: string, congregantId: string, key: string, text: string) {
  // ON CONFLICT DO NOTHING keeps the surrounding transaction valid on a duplicate delivery.
  const r = await tx.outboundMessage.createMany({
    data: [{ tenantId, congregantId, kind: "menu_reply", idempotencyKey: `reply:${key}`, scheduledFor: new Date(), body: { text } }],
    skipDuplicates: true,
  });
  if (!r.count) return null;
  return (await tx.outboundMessage.findUniqueOrThrow({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: `reply:${key}` } } })).id;
}

/** Handles a stored inbound event. Idempotent per provider message id. Returns ids of replies to dispatch. */
export async function processMessagingEvent(tenantId: string, eventId: string) {
  const replies: string[] = [];
  await withContext(systemCtx(tenantId), async (tx) => {
    const ev = await tx.providerEvent.findUnique({ where: { id: eventId } });
    if (!ev || ev.status !== "received") return;
    const integration = await tx.integrationAccount.findUniqueOrThrow({ where: { id: ev.integrationAccountId } });
    const parsed = messagingProvider(integration.provider).parseWebhook(JSON.stringify(ev.payload));
    for (const s of parsed.statuses) {
      await tx.outboundMessage.updateMany({ where: { providerMessageId: s.providerMessageId }, data: { status: s.status === "sent" ? "accepted" : s.status } });
    }
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const opts = parseSettings(tenant.settings);
    for (const m of parsed.messages) {
      const phone = normalizePhone(m.from);
      // WhatsApp itself proves the sender owns this number – no extra login needed for the statement.
      const cards = phone ? await cardsForPhone(tx, phone) : [];
      const card = cards[0];
      if (!card) continue; // unknown number: no data disclosed, no card created
      const choice = m.text.trim();
      let text: string;
      if (/^(5|הסר|הפסק|stop)$/i.test(choice)) {
        await setOptOut(tx, tenantId, card.id, "whatsapp_stop", "congregant");
        text = "הבקשה התקבלה. לא יישלחו אליך עוד תזכורות. אפשר לחדש דרך הגבאי.";
      } else if (/^(1|חוב|חובות|יתרה|החוב שלי|החובות שלי)$/.test(choice)) {
        const link = await issuePersonalLink(tx, tenantId, card.id, "system:bot");
        text = await debtStatementText(tx, tenant.name, cards, link.url);
      } else if (choice === "2" || choice === "לתשלום") {
        const link = await issuePersonalLink(tx, tenantId, card.id, "system:bot");
        text = `לתשלום מאובטח (אפשר גם סכום חלקי): ${link.url}`;
      } else if (choice === "3" && opts.portalReportExternalPayment) {
        await tx.task.create({
          data: { tenantId, kind: "external_payment", congregantId: card.id, summary: "המתפלל דיווח בוואטסאפ ששילם בדרך אחרת", pausesReminders: true, details: { source: "whatsapp" } },
        });
        text = "תודה. הגבאי יבדוק את הדיווח. עד אז לא יישלחו תזכורות. אפשר לפרט סכום ואמצעי תשלום גם בעמוד האישי.";
      } else if (choice === "4" && opts.portalInquiry) {
        await openInquiry(tx, tenantId, card.id, m.text, "whatsapp");
        text = "פנייתך לבירור התקבלה והועברה לגבאי. התזכורות מושהות עד לטיפול.";
      } else {
        text = menuText(opts);
      }
      const id = await queueReply(tx, tenantId, card.id, m.providerMessageId, text);
      if (id) replies.push(id);
    }
    await tx.providerEvent.update({ where: { id: eventId }, data: { status: "processed", processedAt: new Date(), attempts: { increment: 1 } } });
  });
  return replies;
}
