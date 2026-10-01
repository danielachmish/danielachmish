import { execSync } from "node:child_process";
import pg from "pg";
import { migrationDatabaseUrl } from "../src/server/env";
import { loadConfig } from "../src/server/config";

// Build on Vercel: create/refresh the restricted runtime role, run migrations, seed the demo, build Next.
// Runs with the database owner connection that the Neon integration provides.
async function main() {
  // Diagnostics for the build log: which database-related variables exist (names only, never values).
  const dbVars = Object.keys(process.env).filter((k) => /(DATABASE|POSTGRES|STORAGE|NEON|PG)/.test(k) && !/PASSWORD/.test(k)).sort();
  console.log(`database variables present: ${dbVars.length ? dbVars.join(", ") : "(none)"}`);
  console.log(`mode: APP_ENV=${process.env.APP_ENV ?? "-"} PROVIDER_MODE=${process.env.PROVIDER_MODE ?? "-"}`);
  // Same validation the server runs at start-up – fail the build, not the live site.
  loadConfig();
  console.log("✓ configuration valid");
  const owner = migrationDatabaseUrl();
  const appPassword = process.env.APP_DB_PASSWORD;
  if (!owner)
    throw new Error("No database connected. Connect a Postgres database (Storage → Neon → Connect) to the project, then redeploy.");
  console.log(`database host: ${new URL(owner).hostname}`);
  if (!appPassword || appPassword.length < 24)
    throw new Error(
      process.env.APP_ENV === "production"
        ? "Set APP_SECRET (32+ random characters) in the project's environment variables."
        : "Set APP_DB_PASSWORD (24+ random characters) in the project's environment variables.",
    );

  const c = new pg.Client({ connectionString: owner, connectionTimeoutMillis: 20_000 });
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
  if (process.env.APP_ENV === "production") {
    // A production database must not contain the demo's dummy accounts (their passwords are public).
    const chk = new pg.Client({ connectionString: owner, connectionTimeoutMillis: 20_000 });
    await chk.connect();
    const demo = (await chk.query(`SELECT count(*)::int n FROM "user" WHERE email LIKE '%@example.test'`)).rows[0].n as number;
    await chk.end();
    if (demo > 0) throw new Error("This production database contains demo accounts (@example.test). Connect a fresh database, then redeploy.");
    execSync("npx tsx scripts/bootstrap-admin.ts", { stdio: "inherit", env });
  }
  execSync("npx next build", { stdio: "inherit", env });
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
