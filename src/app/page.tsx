import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { rolesFor } from "@/server/auth/roles";
import Link from "next/link";
import { ChevronLeft, LayoutDashboard, ShieldCheck, Wallet } from "lucide-react";
import { AuthShell } from "@/components/brand";
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
    <AuthShell title={`שלום ${user.name}`} subtitle="לאן להיכנס?" footer={<SignOutButton />}>
      <ul className="space-y-2">
        {roles.map((r) => {
          const Icon = r.kind === "admin" ? ShieldCheck : r.kind === "gabbai" ? LayoutDashboard : Wallet;
          return (
            <li key={r.href}>
              <Link href={r.href} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 font-medium transition hover:border-brand-300 hover:bg-brand-50">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="flex-1">{r.label}</span>
                <ChevronLeft className="size-5 text-slate-400" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </AuthShell>
  );
}
