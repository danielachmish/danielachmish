import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import pg from "pg";
import { sendEmail } from "../providers/email";
import { runtimeDatabaseUrl } from "../env";

// Self-hosted auth (Better Auth): scrypt password hashing, httpOnly session cookies, CSRF/origin checks,
// DB-backed rate limiting. Emails go through src/server/providers/email.ts (Resend, or the dev inbox).
const mail = (to: string, subject: string, intro: string, url: string) =>
  sendEmail({ to, subject, url, text: `${intro}\n\n${url}\n\nאם לא ביקשת זאת, אפשר להתעלם מהודעה זו.` });

const globalForAuth = globalThis as unknown as { authPool?: pg.Pool };
const pool = (globalForAuth.authPool ??= new pg.Pool({ connectionString: runtimeDatabaseUrl(), max: process.env.VERCEL ? 2 : 5 }));

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
    sendResetPassword: async ({ user, url }) => mail(user.email, "איפוס סיסמה", "לבחירת סיסמה חדשה למערכת הנדרים:", url),
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => mail(user.email, "אימות כתובת דוא\"ל", "לאימות כתובת הדוא\"ל שלך:", url),
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
  trustedOrigins: process.env.APP_BASE_URL ? [process.env.APP_BASE_URL] : [],
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  plugins: [nextCookies()],
});
