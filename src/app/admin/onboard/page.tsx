import { PlusCircle } from "lucide-react";
import { requireAdmin } from "@/server/auth/session";
import { emailConfigured } from "@/server/providers/email";
import { PageHeader } from "@/components/ui";
import { OnboardWizard } from "./wizard";

export default async function OnboardPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="הצטרפות בית כנסת" icon={PlusCircle} subtitle="שלושה צעדים קצרים. שום דבר לא נוצר עד האישור בסוף." />
      <OnboardWizard emailReady={emailConfigured()} />
    </div>
  );
}
