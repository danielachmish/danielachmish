import { after } from "next/server";
import { receivePaymentCallback } from "@/server/payments/intake";
import { inlineJobs } from "@/server/env";
import { processEventAndFollowUps } from "@/worker/jobs";

const MAX_BODY = 256 * 1024;

// Durable intake only: store + enqueue, reply fast. Never changes balances directly.
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!["fake", "payplus"].includes(provider)) return new Response("not found", { status: 404 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response("too large", { status: 413 });
  try {
    const r = await receivePaymentCallback(provider, req.headers, raw);
    // Serverless hosting: verify and record right after replying (the stored event is also retried by the cron tick).
    if (r.outcome === "accepted" && inlineJobs()) after(() => processEventAndFollowUps(r.tenantId, r.eventId));
    // Unrouted / duplicate are acknowledged so the provider does not retry forever; they are recorded.
    return Response.json({ ok: true, outcome: r.outcome });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", where: "payment-callback", error: (e as Error).name, message: (e as Error).message.slice(0, 200) }));
    return new Response("temporary error", { status: 503 }); // provider will retry
  }
}
