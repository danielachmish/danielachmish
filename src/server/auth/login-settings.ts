import { z } from "zod";
import type { Tx } from "../db/client";
import { withContext } from "../db/context";
import { isProductionEnv } from "../env";

// How congregants sign in – decided by the platform owner in the admin station (key "congregant_login").
//   phoneLogin   – the "phone number + code" entrance (/enter). Hidden and disabled while false.
//   codeChannel  – where one-time codes go (phone login and personal links); null = OTP_CHANNEL from the environment.
// E-mail + password accounts (by gabbai invitation) are always available.
export const CODE_CHANNELS = ["email", "sms", "whatsapp", "fake"] as const;
export type CodeChannel = (typeof CODE_CHANNELS)[number];

export const loginSettingsSchema = z.object({
  phoneLogin: z.boolean().default(false),
  codeChannel: z.enum(CODE_CHANNELS).nullable().default(null),
});
export type LoginSettings = z.infer<typeof loginSettingsSchema>;

const KEY = "congregant_login";

function parse(raw: unknown): LoginSettings {
  const r = loginSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : loginSettingsSchema.parse({});
}

export async function loginSettingsTx(tx: Tx): Promise<LoginSettings> {
  return parse((await tx.platformSetting.findUnique({ where: { key: KEY } }))?.value);
}

export async function loginSettings(): Promise<LoginSettings> {
  return withContext({ kind: "system" }, loginSettingsTx);
}

export function effectiveChannel(s: LoginSettings): CodeChannel {
  return s.codeChannel ?? ((process.env.OTP_CHANNEL ?? "fake") as CodeChannel);
}

/** Channels the admin may pick on this deployment (keys present; fake never in production). */
export function availableChannels(): { value: CodeChannel; label: string; ready: boolean; note?: string }[] {
  const twilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM));
  const list: { value: CodeChannel; label: string; ready: boolean; note?: string }[] = [
    { value: "email", label: "דוא״ל (הכתובת שבכרטיס המתפלל)", ready: true, note: process.env.RESEND_API_KEY ? undefined : "ללא RESEND_API_KEY ההודעות מופיעות בתיבת הבדיקה בלבד" },
    { value: "sms", label: "SMS (Twilio)", ready: twilio, note: twilio ? undefined : "חסרים משתני TWILIO_*" },
    { value: "whatsapp", label: "וואטסאפ של בית הכנסת", ready: true, note: "דורש חיבור וואטסאפ פעיל ותבנית קוד מאושרת" },
  ];
  if (!isProductionEnv()) list.push({ value: "fake", label: "תיבת בדיקה (פיתוח והדגמה בלבד)", ready: true });
  return list;
}

export async function saveLoginSettings(tx: Tx, by: string, input: LoginSettings) {
  const value = loginSettingsSchema.parse(input);
  if (value.codeChannel === "fake" && isProductionEnv()) throw new Error("fake code channel is disabled in production");
  await tx.platformSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedBy: by }, update: { value, updatedBy: by } });
}
