// Deployment environment. NODE_ENV only says how Next was built; APP_ENV says what the deployment is for:
//   development / test – local work · demo – public demo with fake providers only · production – real money.
// A deployment that does not say APP_ENV=demo is treated as production whenever NODE_ENV=production.
export type AppEnv = "development" | "test" | "demo" | "production";

export function appEnv(): AppEnv {
  const v = process.env.APP_ENV;
  if (v === "development" || v === "test" || v === "demo" || v === "production") return v;
  if (process.env.NODE_ENV === "production") return "production";
  return process.env.NODE_ENV === "test" ? "test" : "development";
}

export const isProductionEnv = () => appEnv() === "production";
export const isDemo = () => appEnv() === "demo";

/** On serverless hosting (Vercel) there is no long-running worker: jobs run right after the request. */
export const inlineJobs = () => process.env.INLINE_JOBS === "true" || !!process.env.VERCEL;

function derivedBaseUrl(): string | undefined {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
}

/**
 * Runtime DB URL for the restricted role. Locally DATABASE_URL already is that role.
 * On hosted Postgres (e.g. Neon via Vercel) DATABASE_URL is the owner; with APP_DB_PASSWORD set we connect
 * as synagogue_app with the same host instead, so RLS always applies at runtime.
 */
export function runtimeDatabaseUrl(): string | undefined {
  if (process.env.APP_DATABASE_URL) return process.env.APP_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base || !process.env.APP_DB_PASSWORD) return base;
  const u = new URL(base);
  u.username = "synagogue_app";
  u.password = process.env.APP_DB_PASSWORD;
  return u.toString();
}

/** Owner URL used only for migrations / setup. Prefers a direct (unpooled) connection. */
export function migrationDatabaseUrl(): string | undefined {
  return process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? (process.env.APP_DB_PASSWORD ? process.env.DATABASE_URL : undefined);
}

// Fill derived values once, before config validation and Better Auth read them.
const b = derivedBaseUrl();
if (b) {
  process.env.APP_BASE_URL ??= b;
  process.env.BETTER_AUTH_URL ??= b;
}
