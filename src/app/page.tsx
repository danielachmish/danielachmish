import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { rolesFor } from "@/server/auth/roles";
import { LinkButton } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out";

// One entrance for everyone: after sign-in each user lands in his area. A user with several roles
// (e.g. a gabbai who also has pledges) picks one here; every area links back via "החלפת תפקיד".
export default async function Home({ searchParams }: { searchParams: Promise<{ choose?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const roles = await rolesFor(user as typeof user & { platformRole?: string });
  const { choose } = await searchParams;
  if (roles.length === 0) redirect("/login?e=no_membership");
  if (roles.length === 1 && !choose) redirect(roles[0]!.href);
  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 py-10">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">שלום {user.name}</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-slate-600">לאן להיכנס?</p>
      <ul className="space-y-2">
        {roles.map((r) => (
          <li key={r.href}>
            <LinkButton href={r.href} variant={r.kind === "congregant" ? "secondary" : "primary"} className="w-full justify-center">
              {r.label}
            </LinkButton>
          </li>
        ))}
      </ul>
    </main>
  );
}
