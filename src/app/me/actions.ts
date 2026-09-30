"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { run } from "@/server/actions/result";
import { DomainError } from "@/server/errors";
import { parseShekelsToAgorot } from "@/server/money";
import { portalCtx, portalIdentity, switchSynagogue } from "@/server/portal/links";
import { portalInquiry, portalOptOut, portalReportPayment } from "@/server/portal/actions";
import { createPaymentRequest } from "@/server/payments/requests";
import { PORTAL_COOKIE } from "@/server/portal/cookie";

async function identity() {
  const p = await portalIdentity((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!p) throw new DomainError("session_expired", "פג תוקף הכניסה. פתחו שוב את הקישור האישי.", 401);
  return p;
}
const uuid = z.uuid();

export async function payAction(input: { congregantId: string; amount?: string; pledgeIds?: string[]; idempotencyKey: string }) {
  return run(async () => {
    const p = await identity();
    const cid = uuid.parse(input.congregantId);
    if (!p.congregantIds.includes(cid)) throw new DomainError("not_found", "הכרטיס לא נמצא.", 404);
    const r = await createPaymentRequest(portalCtx(p), {
      congregantId: cid,
      amountAgorot: input.amount ? parseShekelsToAgorot(input.amount) : undefined,
      pledgeIds: (input.pledgeIds ?? []).map((x) => uuid.parse(x)),
      idempotencyKey: input.idempotencyKey,
      via: "portal",
    });
    return { paymentUrl: r.paymentUrl };
  });
}

export async function reportPaidAction(input: { congregantId: string; amount: string; method: "cash" | "transfer" | "check"; reference?: string; note?: string; clientOpId: string }) {
  return run(async () => {
    const p = await identity();
    await portalReportPayment(p, {
      congregantId: uuid.parse(input.congregantId),
      amountAgorot: parseShekelsToAgorot(input.amount),
      method: z.enum(["cash", "transfer", "check"]).parse(input.method),
      reference: input.reference,
      note: input.note,
      clientOpId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).parse(input.clientOpId),
    });
  }, "הדיווח התקבל. החוב יתעדכן לאחר אישור הגבאי, ועד אז לא יישלחו תזכורות.");
}

export async function inquiryAction(congregantId: string, text: string) {
  return run(async () => {
    const p = await identity();
    await portalInquiry(p, uuid.parse(congregantId), text);
  }, "הפנייה הועברה לגבאי. התזכורות מושהות עד לטיפול.");
}

export async function optOutAction(congregantId: string) {
  return run(async () => {
    const p = await identity();
    await portalOptOut(p, uuid.parse(congregantId));
  }, "לא יישלחו אליך עוד תזכורות.");
}

export async function logoutAction() {
  (await cookies()).delete(PORTAL_COOKIE);
}

export async function switchSynagogueAction(tenantId: string) {
  return run(async () => {
    const p = await identity();
    const r = await switchSynagogue(p, uuid.parse(tenantId));
    (await cookies()).set(PORTAL_COOKIE, r.sessionToken, {
      httpOnly: true,
      secure: (process.env.APP_BASE_URL ?? "").startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: r.maxAgeSeconds,
    });
  });
}
