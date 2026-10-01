import Link from "next/link";
import { congregantTenants } from "@/server/auth/roles";

/** Shown to a gabbai / admin who also has a congregant account: back to the role picker. */
export async function RoleSwitchLink({ userId }: { userId: string }) {
  if ((await congregantTenants(userId)).length === 0) return null;
  return (
    <Link href="/?choose=1" className="rounded-lg px-3 py-2 text-sm text-brand-700 hover:bg-slate-100">
      החלפת תפקיד
    </Link>
  );
}
