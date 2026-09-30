import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations run with the schema-owner role (MIGRATION_DATABASE_URL).
// The application itself connects with DATABASE_URL (restricted runtime role).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.STORAGE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? (process.env.APP_DB_PASSWORD ? process.env.DATABASE_URL : undefined) ?? "" },
});
