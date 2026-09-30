import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import pg from "pg";
import { fakePut } from "../providers/fake-store";

// Self-hosted auth (Better Auth): scrypt password hashing, httpOnly session cookies, CSRF/origin checks,
// DB-backed rate limiting. Email delivery is a provider decision; in development emails go to /dev/inbox.
async function sendEmail(to: string, subject: string, url: string) {
  if (process.env.NODE_ENV === "production" || (process.env.PROVIDER_MODE ?? "fake") !== "fake")
    throw new Error("email delivery provider is not configured");
  await fakePut("email", `${to}:${Date.now()}`, { to, subject, url });
}

const globalForAuth = globalThis as unknown as { authPool?: pg.Pool };
const pool = (globalForAuth.authPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 }));

export const auth = betterAuth({
  appName: "ניהול נדרים",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  telemetry: { enabled: false },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => sendEmail(user.email, "איפוס סיסמה", url),
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => sendEmail(user.email, "אימות כתובת דוא\"ל", url),
  },
  user: { additionalFields: { platformRole: { type: "string", input: false, defaultValue: "none" } } },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/sign-up/email": { window: 300, max: 3 },
    },
  },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  plugins: [nextCookies()],
});
