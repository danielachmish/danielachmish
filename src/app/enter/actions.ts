"use server";

import { cookies } from "next/headers";
import { randomToken } from "@/server/crypto";
import { run } from "@/server/actions/result";
import { DomainError } from "@/server/errors";
import { startPhoneLogin, verifyOtp } from "@/server/portal/links";
import { PORTAL_COOKIE } from "@/server/portal/cookie";

// Congregant login with phone + one-time code. Unknown numbers get an indistinguishable dummy ticket and the
// same "wrong code" answer, so the page reveals nothing about who is registered.
export async function startPhoneLoginAction(phone: string) {
  return run(async () => {
    const r = await startPhoneLogin(phone);
    return { ticket: r.ticket ?? randomToken() };
  });
}

export async function verifyPhoneLoginAction(ticket: string, code: string) {
  return run(async () => {
    try {
      const r = await verifyOtp(ticket, code.trim());
      (await cookies()).set(PORTAL_COOKIE, r.sessionToken, {
        httpOnly: true,
        secure: (process.env.APP_BASE_URL ?? "").startsWith("https://"),
        sameSite: "lax",
        path: "/",
        maxAge: r.maxAgeSeconds,
      });
    } catch (e) {
      if (e instanceof DomainError && (e.code === "link_invalid" || e.code === "otp_invalid"))
        throw new DomainError("otp_invalid", "הקוד שגוי או שפג תוקפו. אפשר לבקש קוד חדש.");
      throw e;
    }
  });
}
