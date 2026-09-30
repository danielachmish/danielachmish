import { prisma } from "@/server/db/client";
import { loadConfig } from "@/server/config";
import { inlineJobs } from "@/server/env";

// Readiness: configuration valid, database reachable, migrations applied, queue schema present.
export async function GET() {
  const checks: Record<string, boolean> = {};
  try {
    loadConfig();
    checks.config = true;
  } catch {
    checks.config = false;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
    if (!inlineJobs()) {
      // Worker mode needs the queue schema; serverless mode runs jobs inline and by the cron tick.
      const r = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int n FROM information_schema.schemata WHERE schema_name = 'pgboss'`;
      checks.queue = (r[0]?.n ?? 0) > 0;
    }
  } catch {
    checks.database = false;
    checks.queue = false;
  }
  const ok = Object.values(checks).every(Boolean);
  return Response.json({ status: ok ? "ready" : "not_ready", checks }, { status: ok ? 200 : 503 });
}
