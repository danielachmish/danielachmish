import { z } from "zod";

// Validated once at startup. Refuses dangerous combinations (fake providers in production).
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_BASE_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    APP_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "APP_ENCRYPTION_KEY must be 32 bytes, base64"),
    PROVIDER_MODE: z.enum(["fake", "sandbox", "live"]).default("fake"),
    OTP_CHANNEL: z.enum(["fake", "whatsapp", "sms"]).default("fake"),
    SAAS_PLAN_PRICE_AGOROT: z.coerce.number().int().min(0).default(0),
    SAAS_PLAN_MONTHLY_MESSAGE_QUOTA: z.coerce.number().int().min(0).default(500),
    SAAS_TRIAL_DAYS: z.coerce.number().int().min(0).default(30),
    SAAS_GRACE_DAYS: z.coerce.number().int().min(0).default(14),
    SAAS_EXPORT_ACCESS_DAYS: z.coerce.number().int().min(0).default(90),
    PAYPLUS_API_BASE: z.url().optional(),
    WHATSAPP_API_BASE: z.url().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (env.PROVIDER_MODE !== "live")
      ctx.addIssue({ code: "custom", path: ["PROVIDER_MODE"], message: "production requires PROVIDER_MODE=live" });
    if (env.OTP_CHANNEL === "fake")
      ctx.addIssue({ code: "custom", path: ["OTP_CHANNEL"], message: "fake OTP channel is forbidden in production" });
    if (/localhost|127\.0\.0\.1/.test(env.APP_BASE_URL))
      ctx.addIssue({ code: "custom", path: ["APP_BASE_URL"], message: "production cannot use a local base URL" });
  });

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Only variable names and messages – never values.
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}

export function config(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

// Plan values are read on each call (cheap) so an operator config change applies without a restart.
export function planConfig() {
  const c = loadConfig();
  return {
    priceAgorot: c.SAAS_PLAN_PRICE_AGOROT,
    monthlyMessageQuota: c.SAAS_PLAN_MONTHLY_MESSAGE_QUOTA,
    trialDays: c.SAAS_TRIAL_DAYS,
    graceDays: c.SAAS_GRACE_DAYS,
    exportAccessDays: c.SAAS_EXPORT_ACCESS_DAYS,
  };
}
