"use server";

import { cookies } from "next/headers";
import { run } from "@/server/actions/result";
import { linkLanding, requestOtp, verifyOtp } from "@/server/portal/links";

import { PORTAL_COOKIE } from "@/server/portal/cookie";

// The link token reaches these actions from the URL fragment (never from the URL path/query).
export async function landingAction(token: string) {
  return run(() => linkLanding(token));
}
export async function requestOtpAction(token: string) {
  return run(() => requestOtp(token), "נשלח קוד אימות.");
}
export async function verifyOtpAction(token: string, code: string) {
  return run(async () => {
    const r = await verifyOtp(token, code.trim());
    (await cookies()).set(PORTAL_COOKIE, r.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: r.maxAgeSeconds,
    });
  });
}
