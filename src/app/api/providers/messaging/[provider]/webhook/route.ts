import { after } from "next/server";
import { receiveMessagingWebhook } from "@/server/messaging/bot";
import { inlineJobs } from "@/server/env";
import { processEventAndFollowUps } from "@/worker/jobs";
import { safeEqual } from "@/server/crypto";

// WhatsApp Cloud verification handshake (GET) and inbound messages / statuses (POST).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && u.searchParams.get("hub.mode") === "subscribe" && safeEqual(u.searchParams.get("hub.verify_token") ?? "", token))
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!["fake", "whatsapp_cloud"].includes(provider)) return new Response("not found", { status: 404 });
  const raw = await req.text();
  if (raw.length > 512 * 1024) return new Response("too large", { status: 413 });
  try {
    const r = await receiveMessagingWebhook(provider, req.headers, raw);
    if (r.outcome === "accepted" && inlineJobs()) after(() => processEventAndFollowUps(r.tenantId, r.eventId));
    return Response.json({ ok: r.outcome !== "rejected" }, { status: r.outcome === "rejected" ? 401 : 200 });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", where: "messaging-webhook", error: (e as Error).name }));
    return new Response("temporary error", { status: 503 });
  }
}
