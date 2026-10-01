import { createHmac } from "node:crypto";

// Vercel's Neon integration prefixes its variables with a name chosen at connect time
// (DATABASE_URL, STORAGE_DATABASE_URL, …). Normalise to DATABASE_URL / DATABASE_URL_UNPOOLED.
// Only ever assign real values: assigning undefined to process.env stores the string "undefined".
function pickEnv(patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const key = Object.keys(process.env)
      .filter((k) => re.test(k))
      .sort()
      .find((k) => {
        const v = process.env[k];
        return !!v && v !== "undefined" && /^postgres(ql)?:\/\//.test(v);
      });
    if (key) return process.env[key];
  }
  return undefined;
}
function normaliseDatabaseEnv() {
  for (const k of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) if (process.env[k] === "undefined" || process.env[k] === "") delete process.env[k];
  if (!process.env.DATABASE_URL) {
    const v = pickEnv([/^[A-Z0-9_]*DATABASE_URL$/, /^[A-Z0-9_]*POSTGRES_PRISMA_URL$/, /^[A-Z0-9_]*POSTGRES_URL$/, /^[A-Z0-9_]*STORAGE_URL$/]);
    if (v) process.env.DATABASE_URL = v;
  }
  if (!process.env.DATABASE_URL_UNPOOLED) {
    const v = pickEnv([/^[A-Z0-9_]*DATABASE_URL_UNPOOLED$/, /^[A-Z0-9_]*POSTGRES_URL_NON_POOLING$/, /^[A-Z0-9_]*URL_UNPOOLED$/]);
    if (v) process.env.DATABASE_URL_UNPOOLED = v;
  }
}
normaliseDatabaseEnv();

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

/**
 * Zero-configuration demo on Vercel: a Vercel deployment without APP_ENV is a demo (fake providers only –
 * it can never move real money, since live providers need PROVIDER_MODE=live which demo mode refuses).
 * Missing secrets are derived from the connected database URL: it is secret, stable, and present at both
 * build and runtime. Any variable set explicitly in the project always wins.
 */
function zeroConfigDemo() {
  if (!process.env.VERCEL || process.env.APP_ENV) return;
  const seed = process.env.DATABASE_URL;
  process.env.APP_ENV = "demo";
  process.env.PROVIDER_MODE ??= "fake";
  process.env.OTP_CHANNEL ??= "fake";
  if (!seed) return;
  const derive = (purpose: string) => createHmac("sha256", seed).update(`synagogue-saas:${purpose}`).digest();
  process.env.APP_DB_PASSWORD ??= derive("app-db-password").toString("hex");
  process.env.BETTER_AUTH_SECRET ??= derive("better-auth-secret").toString("hex");
  process.env.APP_ENCRYPTION_KEY ??= derive("encryption-key").toString("base64");
  process.env.CRON_SECRET ??= derive("cron-secret").toString("hex");
}
zeroConfigDemo();

/**
 * Production with a single owner-chosen secret: APP_SECRET (32+ random characters) derives every internal
 * secret (DB role password, auth secret, encryption key, cron secret), so the owner sets one value instead of
 * four. Explicit variables always win. Unlike the demo, nothing is derived from the database URL – rotating the
 * database password must never change the encryption key. Safe defaults: real providers only (nothing is
 * connected until a synagogue connects its own account) and one-time codes by e-mail.
 */
function productionFromAppSecret() {
  if (process.env.APP_ENV !== "production") return;
  process.env.PROVIDER_MODE ??= "live";
  process.env.OTP_CHANNEL ??= "email";
  const seed = process.env.APP_SECRET;
  if (!seed || seed.length < 32) return;
  const derive = (purpose: string) => createHmac("sha256", seed).update(`synagogue-saas:prod:${purpose}`).digest();
  process.env.APP_DB_PASSWORD ??= derive("app-db-password").toString("hex");
  process.env.BETTER_AUTH_SECRET ??= derive("better-auth-secret").toString("hex");
  process.env.APP_ENCRYPTION_KEY ??= derive("encryption-key").toString("base64");
  process.env.CRON_SECRET ??= derive("cron-secret").toString("hex");
}
productionFromAppSecret();

// Fill derived values once, before config validation and Better Auth read them.
const b = derivedBaseUrl();
if (b) {
  process.env.APP_BASE_URL ??= b;
  process.env.BETTER_AUTH_URL ??= b;
}

/**
 * Provider environment per kind. Payments follow PROVIDER_MODE; messaging follows MESSAGING_MODE when set
 * (e.g. testing Meta's WhatsApp test number in "sandbox" while payments stay "fake" on the demo site).
 */
export function modeFor(kind: "payment" | "messaging" | string): "fake" | "sandbox" | "live" {
  const v = (kind === "messaging" ? process.env.MESSAGING_MODE || process.env.PROVIDER_MODE : process.env.PROVIDER_MODE) ?? "fake";
  return v === "sandbox" || v === "live" ? v : "fake";
}
