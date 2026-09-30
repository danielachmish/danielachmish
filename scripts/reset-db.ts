import "dotenv/config";
import pg from "pg";

// Development only: wipes all data (keeps schema) using the owner role.
if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "demo" || process.env.APP_ENV === "production") throw new Error("refusing to reset a deployed database");
const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await c.connect();
const { rows } = await c.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
await c.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
await c.end();
console.log("database emptied");
