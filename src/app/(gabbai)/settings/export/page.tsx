import { Download } from "lucide-react";
import { requireGabbai } from "@/server/auth/session";
import { Card, LinkButton } from "@/components/ui";

export default async function SettingsExport() {
  await requireGabbai();
  return (
    <Card title="ייצוא נתונים" icon={Download} description="הנתונים שלכם – תמיד אפשר להוריד אותם.">
      <div className="flex flex-wrap gap-2">
        <LinkButton variant="secondary" href="/api/export/balances" prefetch={false}><Download className="size-4" aria-hidden /> יתרות מתפללים (CSV)</LinkButton>
        <LinkButton variant="secondary" href="/api/export/ledger" prefetch={false}><Download className="size-4" aria-hidden /> כל התנועות וההקצאות (CSV)</LinkButton>
        <LinkButton variant="secondary" href="/api/export/reports" prefetch={false}><Download className="size-4" aria-hidden /> דוחות (CSV)</LinkButton>
      </div>
    </Card>
  );
}
