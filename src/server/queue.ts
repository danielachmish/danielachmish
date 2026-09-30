import { PgBoss } from "pg-boss";
import { inlineJobs } from "./env";

// Durable job queue stored in PostgreSQL (pg-boss). The worker process consumes it; the web process only enqueues.
export const QUEUES = {
  providerEvent: "provider-event",
  outbox: "outbox",
  sweep: "sweep",
  reminderScan: "reminder-scan",
  sendReminder: "send-reminder",
  reconcile: "reconcile",
  pollOpenPayments: "poll-open-payments",
  subscriptions: "subscriptions",
} as const;

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  starting ??= (async () => {
    const b = new PgBoss({ connectionString: process.env.DATABASE_URL!, migrate: false, supervise: false, schedule: false });
    b.on("error", (e) => console.error("[queue] error", (e as Error).message));
    await b.start();
    boss = b;
    return b;
  })();
  return starting;
}

/** Best-effort enqueue. The sweeper re-enqueues anything left in "received" state, so a lost enqueue is recovered. */
export async function enqueue(name: string, data: object, opts: { singletonKey?: string } = {}) {
  if (process.env.QUEUE_DISABLED === "true" || inlineJobs()) return null; // serverless: handled inline / by the cron tick
  try {
    return await (await getBoss()).send(name, data, { singletonKey: opts.singletonKey, retryLimit: 5, retryBackoff: true });
  } catch (e) {
    console.error("[queue] enqueue failed", name, (e as Error).message);
    return null;
  }
}
