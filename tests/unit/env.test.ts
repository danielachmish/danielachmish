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
