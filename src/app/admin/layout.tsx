import { requireAdmin } from "@/server/auth/session";
import { currentUser } from "@/server/auth/session";
import { SignOutButton } from "@/components/sign-out";
import { RoleSwitchLink } from "@/components/role-switch";
import { GabbaiShell } from "@/components/gabbai/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const user = await currentUser();
  return (
    <GabbaiShell
      variant="admin"
      tenantName="ניהול השירות"
      userName={user?.name ?? ""}
      footer={
        <div className="flex w-full items-center justify-between gap-1">
          <RoleSwitchLink userId={a.userId} />
          <SignOutButton />
        </div>
      }
    >
      {children}
    </GabbaiShell>
  );
}
