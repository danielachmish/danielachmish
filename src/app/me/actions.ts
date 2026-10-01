"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { run } from "@/server/actions/result";
import { DomainError } from "@/server/errors";
import { parseShekelsToAgorot } from "@/server/money";
import { portalCtx, switchSynagogue } from "@/server/portal/links";
import { currentPortal } from "@/server/portal/current";
import { congregantTenants } from "@/server/auth/roles";
import { portalInquiry, portalOptOut, portalReportPayment } from "@/server/portal/actions";
import { createPaymentRequest } from "@/server/payments/requests";
import { PORTAL_COOKIE, PORTAL_TENANT_COOKIE } from "@/server/portal/cookie";

/** The viewer, resolved in the synagogue of the card the action names (accounts may span synagogues). */
async function identity(congregantId?: string) {
  const p = await currentPortal({ congregantId });
  if (!p) throw new DomainError("session_expired", "פג תוקף הכניסה. היכנסו שוב או פתחו את הקישור האישי.", 401);
  return p;
}

const cookieOpts = { httpOnly: true, secure: (process.env.APP_BASE_URL ?? "").startsWith("https://"), sameSite: "lax" as const, path: "/" };

async function rememberTenant(p: { via?: string; tenantId: string }) {
  if (p.via === "account") (await cookies()).set(PORTAL_TENANT_COOKIE, p.tenantId, { ...cookieOpts, maxAge: 90 * 86400 });
}
const uuid = z.uuid();

export async function payAction(input: { congregantId: string; amount?: string; pledgeIds?: string[]; idempotencyKey: string }) {
  return run(async () => {
    const cid = uuid.parse(input.congregantId);
    const p = await identity(cid);
    if (!p.congregantIds.includes(cid)) throw new DomainError("not_found", "הכרטיס לא נמצא.", 404);
    await rememberTenant(p); // the payment return page resolves the same synagogue
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
    const p = await identity(input.congregantId);
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
    const p = await identity(congregantId);
    await portalInquiry(p, uuid.parse(congregantId), text);
  }, "הפנייה הועברה לגבאי. התזכורות מושהות עד לטיפול.");
}

export async function optOutAction(congregantId: string) {
  return run(async () => {
    const p = await identity(congregantId);
    await portalOptOut(p, uuid.parse(congregantId));
  }, "לא יישלחו אליך עוד תזכורות.");
}

/** Ends the phone-code session; an app account is signed out by the client (Better Auth) as well. */
export async function logoutAction() {
  const jar = await cookies();
  jar.delete(PORTAL_COOKIE);
  jar.delete(PORTAL_TENANT_COOKIE);
}

export async function switchSynagogueAction(tenantId: string) {
  return run(async () => {
    const p = await identity();
    const id = uuid.parse(tenantId);
    if (p.via === "account") {
      if (!(await congregantTenants(p.userId!)).some((t) => t.tenantId === id)) throw new DomainError("not_found", "בית הכנסת לא נמצא.", 404);
      (await cookies()).set(PORTAL_TENANT_COOKIE, id, { ...cookieOpts, maxAge: 90 * 86400 });
      return;
    }
    const r = await switchSynagogue(p, id);
    (await cookies()).set(PORTAL_COOKIE, r.sessionToken, { ...cookieOpts, maxAge: r.maxAgeSeconds });
  });
}
