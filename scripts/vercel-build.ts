import { execSync } from "node:child_process";
import pg from "pg";
import { migrationDatabaseUrl } from "../src/server/env";

// Build on Vercel: create/refresh the restricted runtime role, run migrations, seed the demo, build Next.
// Runs with the database owner connection that the Neon integration provides.
async function main() {
  const owner = migrationDatabaseUrl();
  const appPassword = process.env.APP_DB_PASSWORD;
  if (!owner) throw new Error("No database connected. Connect a Postgres database (Storage → Neon) to the project.");
  if (!appPassword || appPassword.length < 24) throw new Error("Set APP_DB_PASSWORD (24+ random characters) in the project's environment variables.");

  const c = new pg.Client({ connectionString: owner });
  await c.connect();
  const exists = (await c.query("SELECT 1 FROM pg_roles WHERE rolname = 'synagogue_app'")).rowCount;
  const pw = appPassword.replace(/'/g, "''");
  await c.query(exists ? `ALTER ROLE synagogue_app WITH LOGIN PASSWORD '${pw}'` : `CREATE ROLE synagogue_app WITH LOGIN PASSWORD '${pw}'`);
  const db = (await c.query("SELECT current_database() AS d")).rows[0].d as string;
  await c.query(`GRANT CONNECT ON DATABASE "${db}" TO synagogue_app`);
  await c.query("GRANT USAGE ON SCHEMA public TO synagogue_app");
  const flags = (await c.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'synagogue_app'")).rows[0];
  if (flags.rolsuper || flags.rolbypassrls) throw new Error("synagogue_app must not be superuser or BYPASSRLS");
  await c.end();
  console.log("✓ runtime role ready");

  const env = { ...process.env, MIGRATION_DATABASE_URL: owner };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  if (process.env.APP_ENV === "demo" && process.env.DEMO_SEED !== "false") execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
  execSync("npx next build", { stdio: "inherit", env });
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
