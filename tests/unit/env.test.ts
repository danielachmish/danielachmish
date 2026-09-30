import { afterEach, describe, expect, it } from "vitest";
import { appEnv, runtimeDatabaseUrl } from "@/server/env";
import { loadConfig } from "@/server/config";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});
const base = {
  APP_BASE_URL: "https://demo.example.org",
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x".repeat(40),
  APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
};

describe("deployment environment", () => {
  it("NODE_ENV=production without APP_ENV is production", () => {
    process.env = { ...saved, NODE_ENV: "production", APP_ENV: "" } as NodeJS.ProcessEnv;
    expect(appEnv()).toBe("production");
  });
  it("demo allows fake providers but never live", () => {
    expect(loadConfig({ ...base, NODE_ENV: "production", APP_ENV: "demo", PROVIDER_MODE: "fake", OTP_CHANNEL: "fake" }).APP_ENV).toBe("demo");
    expect(() => loadConfig({ ...base, NODE_ENV: "production", APP_ENV: "demo", PROVIDER_MODE: "live" })).toThrow(/demo cannot use live/);
  });
  it("hosted DB: runtime URL switches to the restricted role", () => {
    process.env = { ...saved, APP_DATABASE_URL: "", DATABASE_URL: "postgresql://owner:secret@db.host/app?sslmode=require", APP_DB_PASSWORD: "p@ss w0rd" } as NodeJS.ProcessEnv;
    delete process.env.APP_DATABASE_URL;
    const u = new URL(runtimeDatabaseUrl()!);
    expect(u.username).toBe("synagogue_app");
    expect(decodeURIComponent(u.password)).toBe("p@ss w0rd");
    expect(u.host).toBe("db.host");
    expect(u.search).toBe("?sslmode=require");
  });
});

describe("zero-configuration demo on Vercel", () => {
  it("derives stable secrets from the database URL and defaults to demo", async () => {
    const run = async (dbUrl: string) => {
      process.env = { ...saved, VERCEL: "1", DATABASE_URL: dbUrl } as NodeJS.ProcessEnv;
      for (const k of ["APP_ENV", "PROVIDER_MODE", "OTP_CHANNEL", "APP_DB_PASSWORD", "BETTER_AUTH_SECRET", "APP_ENCRYPTION_KEY", "CRON_SECRET", "APP_DATABASE_URL"]) delete process.env[k];
      const { vi } = await import("vitest");
      vi.resetModules();
      await import("@/server/env");
      return { ...process.env };
    };
    const a = await run("postgresql://owner:s3cret@db.neon.tech/neondb");
    const b = await run("postgresql://owner:s3cret@db.neon.tech/neondb");
    const c = await run("postgresql://owner:other@db.neon.tech/neondb");
    expect(a.APP_ENV).toBe("demo");
    expect(a.PROVIDER_MODE).toBe("fake");
    expect(a.BETTER_AUTH_SECRET).toBe(b.BETTER_AUTH_SECRET);
    expect(a.BETTER_AUTH_SECRET).not.toBe(c.BETTER_AUTH_SECRET);
    expect(Buffer.from(a.APP_ENCRYPTION_KEY!, "base64")).toHaveLength(32);
    expect(a.APP_DB_PASSWORD!.length).toBeGreaterThanOrEqual(24);
    expect(a.BETTER_AUTH_SECRET).not.toContain("s3cret");
  });

  it("explicit values win and APP_ENV=production is never overridden", async () => {
    process.env = { ...saved, VERCEL: "1", DATABASE_URL: "postgresql://o:p@h/d", APP_ENV: "production", BETTER_AUTH_SECRET: "explicit" } as NodeJS.ProcessEnv;
    delete process.env.APP_DB_PASSWORD;
    const { vi } = await import("vitest");
    vi.resetModules();
    await import("@/server/env");
    expect(process.env.APP_ENV).toBe("production");
    expect(process.env.BETTER_AUTH_SECRET).toBe("explicit");
    expect(process.env.APP_DB_PASSWORD).toBeUndefined();
  });
});

describe("Neon integration variable prefix", () => {
  const load = async (vars: Record<string, string>) => {
    process.env = { ...saved, VERCEL: "1", ...vars } as NodeJS.ProcessEnv;
    for (const k of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "APP_ENV", "APP_DB_PASSWORD", "MIGRATION_DATABASE_URL", "POSTGRES_URL_NON_POOLING"])
      if (!(k in vars)) delete process.env[k];
    const { vi } = await import("vitest");
    vi.resetModules();
    return import("@/server/env");
  };

  it("real Vercel/Neon naming with STORAGE prefix (STORAGE_DATABASE_URL…)", async () => {
    const env = await load({
      STORAGE_DATABASE_URL: "postgresql://o:p@pooled.neon.tech/d?sslmode=require",
      STORAGE_DATABASE_URL_UNPOOLED: "postgresql://o:p@direct.neon.tech/d?sslmode=require",
      STORAGE_PGHOST: "pooled.neon.tech",
      STORAGE_NEON_PROJECT_ID: "abc",
    });
    expect(process.env.DATABASE_URL).toBe("postgresql://o:p@pooled.neon.tech/d?sslmode=require");
    expect(env.migrationDatabaseUrl()).toBe("postgresql://o:p@direct.neon.tech/d?sslmode=require");
    expect(new URL(env.runtimeDatabaseUrl()!).username).toBe("synagogue_app");
  });

  it("never creates the string 'undefined' and repairs it if present", async () => {
    await load({ DATABASE_URL: "undefined", STORAGE_DATABASE_URL: "postgresql://o:p@h/d" });
    expect(process.env.DATABASE_URL).toBe("postgresql://o:p@h/d");
    await load({});
    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(process.env.DATABASE_URL_UNPOOLED).toBeUndefined();
  });
});

describe("email provider", () => {
  it("uses Resend when RESEND_API_KEY is set", async () => {
    process.env = { ...saved, RESEND_API_KEY: "re_test", EMAIL_FROM: "נדרים <no-reply@example.org>" } as NodeJS.ProcessEnv;
    const { vi } = await import("vitest");
    const calls: { url: string; body: string; auth: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), auth: (init.headers as Record<string, string>).authorization ?? "" });
      return new Response("{}", { status: 200 });
    });
    const { sendEmail } = await import("@/server/providers/email");
    await sendEmail({ to: "g@example.org", subject: "איפוס", text: "קישור" });
    vi.unstubAllGlobals();
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.auth).toBe("Bearer re_test");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ to: ["g@example.org"], subject: "איפוס" });
  });
});
