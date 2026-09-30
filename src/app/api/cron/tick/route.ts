import { safeEqual } from "@/server/crypto";
import { logError, pollOpenPaymentsAll, reconcileAll, reminderScanAll, subscriptionsAll, sweep } from "@/worker/jobs";

// Scheduled jobs for serverless hosting (no long-running worker).
//   ?job=frequent – every few minutes: recover events, outbox, due messages, reminder scan, open payments
//   ?job=daily    – once a day: subscriptions and reconciliation
// Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token automatically).
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("unauthorized", { status: 401 });
  const job = new URL(req.url).searchParams.get("job") ?? "frequent";
  const ran: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      ran.push(name);
    } catch (e) {
      logError(`tick:${name}`, e);
    }
  };
  if (job === "daily") {
    await step("subscriptions", subscriptionsAll);
    await step("reconcile", reconcileAll);
    await step("reminder-scan", reminderScanAll);
  } else {
    await step("sweep", sweep);
    await step("reminder-scan", reminderScanAll);
    await step("poll-open-payments", pollOpenPaymentsAll);
  }
  return Response.json({ ok: true, job, ran });
}
