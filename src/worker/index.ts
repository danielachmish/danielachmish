import "dotenv/config";
import { PgBoss } from "pg-boss";
import { loadConfig } from "../server/config";
import { QUEUES } from "../server/queue";
import { handleProviderEvent, logError, pollOpenPaymentsAll, reconcileAll, reminderScanAll, subscriptionsAll, sweep } from "./jobs";

// Background worker: a separate process consuming the durable PostgreSQL queue (pg-boss).
// Queue/schedule definitions live in the DB, so jobs survive restarts; handlers are idempotent.
async function main() {
  loadConfig(); // fail fast on invalid / unsafe configuration
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, migrate: false });
  boss.on("error", (e) => logError("pg-boss", e));
  await boss.start();

  for (const q of Object.values(QUEUES)) await boss.createQueue(q).catch(() => {});

  const TZ = { tz: "Asia/Jerusalem" };
  await boss.schedule(QUEUES.sweep, "* * * * *");
  await boss.schedule(QUEUES.pollOpenPayments, "*/5 * * * *");
  // Hourly: each synagogue has its own days/hour; the scan schedules for that synagogue's next window.
  await boss.schedule(QUEUES.reminderScan, "5 * * * *", null, TZ);
  await boss.schedule(QUEUES.reconcile, "30 3 * * *", null, TZ);
  await boss.schedule(QUEUES.subscriptions, "0 4 * * *", null, TZ);

  const one = <T>(fn: (d: T) => Promise<unknown>) => async (jobs: { data: T }[]) => {
    for (const j of jobs) await fn(j.data);
  };
  await boss.work<{ tenantId: string; eventId: string }>(QUEUES.providerEvent, { batchSize: 5 }, one(handleProviderEvent));
  await boss.work(QUEUES.sweep, one(() => sweep()));
  await boss.work(QUEUES.pollOpenPayments, one(() => pollOpenPaymentsAll()));
  await boss.work(QUEUES.reminderScan, one(() => reminderScanAll()));
  await boss.work(QUEUES.reconcile, one(() => reconcileAll()));
  await boss.work(QUEUES.subscriptions, one(() => subscriptionsAll()));

  console.log(JSON.stringify({ level: "info", msg: "worker started", queues: Object.values(QUEUES) }));
  const stop = async () => {
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e) => {
  logError("worker-main", e);
  process.exit(1);
});
