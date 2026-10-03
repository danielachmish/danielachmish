import { redirect } from "next/navigation";

// Moved: system settings now live in tabs at /admin/settings.
export default function AdminDefaults() {
  redirect("/admin/settings?tab=reminders");
}
