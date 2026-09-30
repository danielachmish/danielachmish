import { redirect } from "next/navigation";
import { currentUser, gabbaiSession } from "@/server/auth/session";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if ((user as { platformRole?: string }).platformRole === "admin") redirect("/admin");
  if (await gabbaiSession()) redirect("/dashboard");
  redirect("/login?e=no_membership");
}
