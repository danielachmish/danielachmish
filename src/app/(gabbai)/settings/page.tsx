import { BadgeCheck, Building2 } from "lucide-react";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { Badge, Card, fmtDate } from "@/components/ui";
import { GeneralSettings } from "@/components/gabbai/settings-forms";

const SUB: Record<string, string> = { trial: "ניסיון", active: "פעיל", past_due: "ממתין לתשלום", grace: "תקופת חסד", suspended: "מושעה", cancelled: "מבוטל" };

export default async function SettingsGeneral() {
  const g = await requireGabbai();
  const d = await withContext(g.ctx, async (tx) => ({
    tenant: await tx.tenant.findUniqueOrThrow({ where: { id: g.tenantId } }),
    sub: await tx.saaSSubscription.findUnique({ where: { tenantId: g.tenantId } }),
  }));
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card title="פרטי בית הכנסת" icon={Building2}>
        <GeneralSettings name={d.tenant.name} />
      </Card>
      <Card title="מנוי" icon={BadgeCheck}>
        {d.sub ? (
          <p className="text-sm">
            מצב: <Badge>{SUB[d.sub.status] ?? d.sub.status}</Badge>
            {d.sub.trialEndsAt && d.sub.status === "trial" && <> · הניסיון מסתיים {fmtDate(d.sub.trialEndsAt)}</>}
            {d.sub.currentPeriodEnd && <> · תקופה נוכחית עד {fmtDate(d.sub.currentPeriodEnd)}</>}
          </p>
        ) : (
          <p className="text-sm">אין מנוי רשום.</p>
        )}
      </Card>
    </div>
  );
}
