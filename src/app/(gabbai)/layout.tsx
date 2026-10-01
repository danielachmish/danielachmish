import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { SignOutButton } from "@/components/sign-out";
import { RoleSwitchLink } from "@/components/role-switch";
import { GabbaiShell } from "@/components/gabbai/nav";

export default async function GabbaiLayout({ children }: { children: React.ReactNode }) {
  const g = await requireGabbai();
  const openTasks = await withContext(g.ctx, (tx) => tx.task.count({ where: { status: "open" } }));
  return (
    <GabbaiShell
      tenantName={g.tenantName}
      userName={g.name}
      openTasks={openTasks}
      footer={
        <div className="flex w-full items-center justify-between gap-1">
          <RoleSwitchLink userId={g.userId} />
          <SignOutButton />
        </div>
      }
    >
      {children}
    </GabbaiShell>
  );
}
