import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { prisma } from "@/server/db/client";
import { Card, Empty, fmtDateTime } from "@/components/ui";

const ACTION: Record<string, string> = {
  "pledge.create": "נרשם נדר",
  "pledge.adjust": "תיקון נדר",
  "payment.card_confirmed": "תשלום באשראי אושר",
  "payment.external_recorded": "נרשם תשלום (התקבל)",
  "payment.external_reported": "דווח תשלום לאישור",
  "payment.approved": "תשלום אושר",
  "payment.rejected": "תשלום נדחה",
  "payment.refund": "החזר נקלט",
  "congregant.create": "נוסף מתפלל",
  "congregant.update": "עודכן מתפלל",
  "consent.granted": "נרשמה הסכמה להודעות",
  "consent.revoked": "בוטלה הסכמה",
  "messaging.opt_out": "מתפלל ביקש להפסיק הודעות",
  "personal_link.issue": "נוצר קישור אישי",
  "personal_link.revoke_all": "בוטלו קישורים אישיים",
  "reminder.manual_send": "נשלחה תזכורת ידנית",
  "reminder.bulk_send": "נשלחו תזכורות לכולם",
  "reminder.cancel": "בוטלה תזכורת",
  "integration.connect": "חובר חשבון",
  "integration.replace": "הוחלף חשבון",
  "integration.disconnect": "נותק חשבון",
  "tenant.settings.reminders": "שונתה מדיניות תזכורות",
  "tenant.settings.behaviour": "שונו הגדרות",
  "tenant.settings.general": "שונו פרטי בית הכנסת",
  "support_grant.create": "ניתנה גישת תמיכה",
  "support_grant.revoke": "בוטלה גישת תמיכה",
  "support.view_ledger": "צוות התמיכה צפה בנתונים",
  "task.resolve": "משימה טופלה",
  "credit.apply": "הוחלה זכות",
  "import.congregants": "ייבוא מתפללים",
  "import.pledges": "ייבוא נדרים",
  "export.balances": "ייצוא יתרות",
  "export.ledger": "ייצוא תנועות",
  "export.reports": "ייצוא דוחות",
  "tenant.onboard": "בית הכנסת נוסף למערכת",
  "tenant.replace_head_gabbai": "הוחלף גבאי ראשי",
  "subscription.status": "שונה מצב מנוי",
};
const WHO: Record<string, string> = { gabbai: "גבאי", congregant: "מתפלל", system: "מערכת", provider: "ספק סליקה", platform_admin: "צוות השירות" };

/** Who did what and when – from the append-only audit log of this synagogue. */
export default async function Activity() {
  const g = await requireGabbai();
  const rows = await withContext(g.ctx, (tx) => tx.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
  const userIds = [...new Set(rows.filter((r) => r.actorType === "gabbai" || r.actorType === "platform_admin").map((r) => r.actorId!).filter(Boolean))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <h1 className="text-2xl font-bold">יומן פעולות</h1>
      <Card>
        {rows.length === 0 ? <Empty>אין פעולות עדיין.</Empty> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 py-2">
                <span className="text-slate-500">{fmtDateTime(r.createdAt)}</span>
                <span className="font-medium">{ACTION[r.action] ?? r.action}</span>
                <span className="text-slate-600">{WHO[r.actorType] ?? r.actorType}{r.actorId && nameOf.get(r.actorId) ? ` – ${nameOf.get(r.actorId)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">היומן אינו ניתן לעריכה או למחיקה.</p>
      </Card>
    </>
  );
}
