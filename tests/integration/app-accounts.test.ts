import { beforeEach, describe, expect, it } from "vitest";
import { asTenant, d, gabbai, makeCongregant, makeTenant, truncateAll } from "./helpers";
import { createPledge } from "@/server/ledger/engine";
import { acceptInviteForUser, acceptInviteWithNewAccount, createAppInvite, inviteCongregant, inviteLanding, revokeCongregantAccount } from "@/server/accounts/invites";
import { accountPortalIdentity } from "@/server/portal/current";
import { portalCtx, issuePersonalLink, linkLanding, requestOtp, startPhoneLogin, verifyOtp } from "@/server/portal/links";
import { portalOverview } from "@/server/portal/actions";
import { congregantTenants } from "@/server/auth/roles";
import { saveLoginSettings, loginSettings } from "@/server/auth/login-settings";
import { withContext, tenantCtx } from "@/server/db/context";
import { prisma } from "@/server/db/client";

process.env.QUEUE_DISABLED = "true";
let A: string, B: string;
let moshe: { id: string }, other: { id: string };

const g = (tenantId: string) => ({ ctx: tenantCtx(tenantId, gabbai()), tenantId, actor: gabbai() });
const emails = async (to: string) =>
  (await prisma.devFakeRecord.findMany({ where: { kind: "email" }, orderBy: { createdAt: "desc" } }))
    .map((r) => r.data as { to: string; subject: string; url: string; code: string })
    .filter((m) => m.to === to);
const setLogin = (v: { phoneLogin: boolean; codeChannel: "email" | "sms" | "whatsapp" | "fake" | null }) =>
  withContext({ kind: "platform_admin", userId: "admin" }, (tx) => saveLoginSettings(tx, "admin", v));

beforeEach(async () => {
  await truncateAll();
  A = await makeTenant("אוהל יעקב");
  B = await makeTenant("היכל שלמה");
  moshe = await makeCongregant(A, { firstName: "משה", phone: "+972533334444" });
  other = await makeCongregant(A, { firstName: "אחר", phone: "+972533335555" });
  await asTenant(A, (tx) => tx.congregant.update({ where: { id: moshe.id }, data: { email: "Moshe@Example.test" } }));
  await asTenant(A, (tx) => createPledge(tx, A, gabbai(), { congregantId: moshe.id, amountAgorot: 18000, pledgeDate: d("2026-09-01"), description: "שלישי" }));
  await asTenant(A, (tx) => createPledge(tx, A, gabbai(), { congregantId: other.id, amountAgorot: 99900, pledgeDate: d("2026-09-01") }));
});

describe("congregant app accounts (invitation by the gabbai)", () => {
  it("invitation e-mailed to the card's address → account ready at once, sees only his own card", async () => {
    const { url } = await inviteCongregant(g(A), moshe.id, "email");
    const mail = (await emails("moshe@example.test"))[0]!;
    expect(mail.url).toBe(url);
    const token = url.split("#")[1]!;
    expect(await inviteLanding(token)).toEqual({ synagogueName: "אוהל יעקב", firstName: "משה", suggestedEmail: "moshe@example.test" });

    const r = await acceptInviteWithNewAccount(token, { name: "משה כהן", email: "moshe@example.test", password: "a-strong-password" });
    expect(r.needsVerification).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "moshe@example.test" } });
    expect(user.emailVerified).toBe(true);

    const p = (await accountPortalIdentity(user.id))!;
    expect(p).toMatchObject({ tenantId: A, primaryCongregantId: moshe.id, via: "account" });
    expect(p.congregantIds).toEqual([moshe.id]);
    expect((await portalOverview(p)).summary.debtAgorot).toBe(18000);
    // RLS: the portal context of the account sees no other card of the synagogue.
    const visible = await withContext(portalCtx(p), (tx) => tx.congregant.findMany({ select: { id: true } }));
    expect(visible.map((c) => c.id)).toEqual([moshe.id]);

    // single use
    await expect(acceptInviteWithNewAccount(token, { name: "x", email: "x@example.test", password: "a-strong-password" })).rejects.toMatchObject({ code: "invite_invalid" });
    await expect(inviteLanding(token)).rejects.toMatchObject({ code: "invite_invalid" });
  });

  it("invitation by link (WhatsApp) with another address → e-mail verification required", async () => {
    const { url } = await inviteCongregant(g(A), moshe.id, "link");
    expect(await emails("moshe@example.test")).toHaveLength(0);
    const r = await acceptInviteWithNewAccount(url.split("#")[1]!, { name: "משה", email: "other@example.test", password: "a-strong-password" });
    expect(r.needsVerification).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "other@example.test" } })).emailVerified).toBe(false);
    expect((await emails("other@example.test")).length).toBe(1); // verification mail
  });

  it("weak password, existing address and a newer invitation are refused", async () => {
    const first = await inviteCongregant(g(A), moshe.id, "link");
    await expect(acceptInviteWithNewAccount(first.url.split("#")[1]!, { name: "משה", email: "m@example.test", password: "short" })).rejects.toMatchObject({ code: "invalid_input" });
    const second = await inviteCongregant(g(A), moshe.id, "link");
    await expect(inviteLanding(first.url.split("#")[1]!)).rejects.toMatchObject({ code: "invite_invalid" }); // revoked by the newer one
    await acceptInviteWithNewAccount(second.url.split("#")[1]!, { name: "משה", email: "m@example.test", password: "a-strong-password" });
    const third = await inviteCongregant(g(A), other.id, "link");
    await expect(acceptInviteWithNewAccount(third.url.split("#")[1]!, { name: "אחר", email: "m@example.test", password: "a-strong-password" })).rejects.toMatchObject({ code: "account_exists" });
  });

  it("invitation by e-mail needs an address on the card", async () => {
    await expect(inviteCongregant(g(A), other.id, "email")).rejects.toMatchObject({ code: "no_email" });
  });

  it("an existing user joins a second synagogue; actions resolve the synagogue of the card they name", async () => {
    const one = await inviteCongregant(g(A), moshe.id, "email");
    await acceptInviteWithNewAccount(one.url.split("#")[1]!, { name: "משה", email: "moshe@example.test", password: "a-strong-password" });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "moshe@example.test" } });
    const cardB = await makeCongregant(B, { firstName: "משה", phone: "+972533334444" });
    const two = await withContext(tenantCtx(B, gabbai()), (tx) => createAppInvite(tx, B, gabbai(), cardB.id));
    await acceptInviteForUser(two.token, user.id);

    expect((await congregantTenants(user.id)).map((t) => t.name).sort()).toEqual(["אוהל יעקב", "היכל שלמה"]);
    expect((await accountPortalIdentity(user.id, { congregantId: cardB.id }))!.tenantId).toBe(B);
    expect((await accountPortalIdentity(user.id, { tenantId: A }))!.tenantId).toBe(A);
  });

  it("a user sees only his own account links; the gabbai can disconnect an account", async () => {
    const inv = await inviteCongregant(g(A), moshe.id, "email");
    await acceptInviteWithNewAccount(inv.url.split("#")[1]!, { name: "משה", email: "moshe@example.test", password: "a-strong-password" });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "moshe@example.test" } });
    const stranger = await withContext({ kind: "user", userId: "someone-else" }, (tx) => tx.congregantAccount.findMany());
    expect(stranger).toHaveLength(0);
    // another synagogue's gabbai sees nothing either
    expect(await asTenant(B, (tx) => tx.congregantAccount.findMany())).toHaveLength(0);

    const [link] = await asTenant(A, (tx) => tx.congregantAccount.findMany());
    await asTenant(A, (tx) => revokeCongregantAccount(tx, A, gabbai(), link!.id));
    expect(await accountPortalIdentity(user.id)).toBeNull();
  });
});

describe("congregant login settings (admin)", () => {
  it("phone login is hidden by default", async () => {
    expect(await loginSettings()).toEqual({ phoneLogin: false, codeChannel: null });
  });

  it("codes by e-mail go to the card's address; a card without an address answers like an unknown number", async () => {
    await setLogin({ phoneLogin: true, codeChannel: "email" });
    const { token } = await asTenant(A, (tx) => issuePersonalLink(tx, A, moshe.id, gabbai().id));
    expect((await linkLanding(token)).target).toEqual({ kind: "email", masked: expect.stringMatching(/^M•+@Example\.test$/) });
    await requestOtp(token);
    const mail = (await emails("Moshe@Example.test"))[0]!;
    expect(mail.code).toMatch(/^\d{6}$/);
    const s = await verifyOtp(token, mail.code);
    expect(s.sessionToken).toBeTruthy();

    expect(await startPhoneLogin("053-3335555")).toEqual({ ticket: null }); // card "אחר" has no e-mail
    expect((await startPhoneLogin("053-3334444")).ticket).toBeTruthy();
  });

  it("without an admin choice the server's OTP_CHANNEL applies (phone)", async () => {
    const { token } = await asTenant(A, (tx) => issuePersonalLink(tx, A, other.id, gabbai().id));
    expect((await linkLanding(token)).target).toEqual({ kind: "phone", masked: expect.stringMatching(/5555$/) });
  });
});
