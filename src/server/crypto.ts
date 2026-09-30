import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Provider credentials are encrypted with AES-256-GCM. The key lives in APP_ENCRYPTION_KEY (outside the DB).

function key(): Buffer {
  const k = Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptJson<T = Record<string, string>>(blob: string): T {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("unsupported secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8")) as T;
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
export const hmacSha256 = (secret: string, body: string | Buffer, enc: "hex" | "base64" = "hex") =>
  createHmac("sha256", secret).update(body).digest(enc);

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** URL-safe random token (256 bits). */
export const randomToken = () => randomBytes(32).toString("base64url");
export const randomDigits = (n: number) => Array.from({ length: n }, () => randomInt(0, 10)).join("");
