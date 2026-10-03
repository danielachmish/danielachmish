import { LifeBuoy } from "lucide-react";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { Card } from "@/components/ui";
import { SupportGrantForm } from "@/components/gabbai/settings-forms";

export default async function SettingsSupport() {
  const g = await requireGabbai();
  const grants = await withContext(g.ctx, (tx) => tx.supportGrant.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }));
  return (
    <Card title="גישת תמיכה זמנית" icon={LifeBuoy}>
      <p className="mb-2 text-sm text-slate-600">צוות השירות אינו רואה נתוני מתפללים. אפשר לתת גישה מוגבלת בזמן ובהיקף; כל צפייה מתועדת.</p>
      <SupportGrantForm grants={grants.map((x) => ({ id: x.id, scope: x.scope, reason: x.reason, expiresAt: x.expiresAt.toISOString() }))} />
    </Card>
  );
}
