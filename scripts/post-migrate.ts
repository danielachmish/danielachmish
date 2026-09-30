import "dotenv/config";
import { PgBoss } from "pg-boss";
import pg from "pg";
import { QUEUES } from "../src/server/queue";

// Runs with the schema-owner role after Prisma migrations: installs/updates the pg-boss schema and
// grants the runtime role only what it needs on it.
async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is required");
  const boss = new PgBoss({ connectionString: url, migrate: true, supervise: false, schedule: false });
  await boss.start();
  // Queues (and their storage) are created by the owner; the runtime role only uses them.
  for (const q of Object.values(QUEUES)) if (!(await boss.getQueue(q))) await boss.createQueue(q);
  await boss.stop({ graceful: false });
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(`GRANT USAGE ON SCHEMA pgboss TO synagogue_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO synagogue_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO synagogue_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO synagogue_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO synagogue_app;`);
  await c.end();
  console.log("post-migrate: pg-boss schema ready, runtime grants applied");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
