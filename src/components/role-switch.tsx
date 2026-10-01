import Link from "next/link";
import { Repeat } from "lucide-react";
import { congregantTenants } from "@/server/auth/roles";

/** Shown to a gabbai / admin who also has a congregant account: back to the role picker. */
export async function RoleSwitchLink({ userId }: { userId: string }) {
  if ((await congregantTenants(userId)).length === 0) return <span />;
  return (
    <Link href="/?choose=1" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-brand-700 hover:bg-slate-100">
      <Repeat className="size-4" aria-hidden />
      החלפת תפקיד
    </Link>
  );
}
