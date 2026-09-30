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
