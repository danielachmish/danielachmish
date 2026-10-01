"use server";

import { run } from "@/server/actions/result";
import { currentUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { acceptInviteForUser, acceptInviteWithNewAccount, inviteLanding } from "@/server/accounts/invites";

// The invitation token reaches these actions from the URL fragment (never from the URL path/query).
export async function inviteLandingAction(token: string) {
  return run(async () => {
    const info = await inviteLanding(token);
    const u = await currentUser();
    return { ...info, signedInAs: u?.emailVerified ? u.email : null };
  });
}

export async function acceptNewAccountAction(token: string, input: { name: string; email: string; password: string }) {
  return run(() => acceptInviteWithNewAccount(token, input));
}

export async function acceptForSignedInAction(token: string) {
  return run(async () => {
    const u = await currentUser();
    if (!u?.emailVerified) throw new DomainError("signin_required", "יש להתחבר קודם.", 401);
    await acceptInviteForUser(token, u.id);
  }, "הכרטיס צורף לחשבון שלך.");
}
