import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { planConfig } from "@/server/config";
import { Badge, Card, Empty, fmtDateTime } from "@/components/ui";
import { MSG_STATUS, SKIP_REASON } from "@/components/labels";

export default async function Reminders() {
  const g = await requireGabbai();
  const { msgs, names, sub, tenant } = await withContext(g.ctx, async (tx) => {
    const msgs = await tx.outboundMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    const people = await tx.congregant.findMany({ where: { id: { in: [...new Set(msgs.map((m) => m.congregantId))] } }, select: { id: true, firstName: true, lastName: true } });
    return {
      msgs,
      names: new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`])),
      sub: await tx.saaSSubscription.findUnique({ where: { tenantId: g.tenantId } }),
      tenant: await tx.tenant.findUniqueOrThrow({ where: { id: g.tenantId } }),
    };
  });
  const KIND: Record<string, string> = { reminder: "תזכורת", confirmation: "אישור תשלום", menu_reply: "מענה בוואטסאפ", otp: "קוד" };
  return (
    <>
      <h1 className="text-2xl font-bold">תזכורות והודעות</h1>
      <Card>
        <p className="text-sm">
          תזכורת ראשונה {tenant.reminderFirstDelayDays} ימים אחרי מועד התשלום (או הרישום), ולאחר מכן לכל היותר אחת ל-{tenant.reminderIntervalDays} ימים.
          משלוח בימים א׳–ה׳ בשעה 10:00, לא בחגים ובחול המועד. לא נשלחות תזכורות כשאין חוב, אין הסכמה, יש בירור או תשלום ממתין, או כשהמתפלל ביקש להפסיק.
        </p>
        <p className="mt-2 text-sm">מכסת הודעות חודשית: <span className="num">{sub?.messagesUsed ?? 0} / {planConfig().monthlyMessageQuota}</span></p>
      </Card>
      {msgs.length === 0 ? (
        <Empty>עדיין לא נשלחו הודעות.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100 text-sm">
            {msgs.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge>{KIND[m.kind] ?? m.kind}</Badge>
                <Link href={`/congregants/${m.congregantId}`} className="text-brand-700 hover:underline">{names.get(m.congregantId)}</Link>
                <span className="text-slate-500">{fmtDateTime(m.attemptedAt ?? m.scheduledFor)}</span>
                <Badge tone={m.status === "failed" || m.status === "unknown" ? "red" : m.status === "skipped" ? "slate" : "green"}>{MSG_STATUS[m.status] ?? m.status}</Badge>
                {m.skipReason && <span className="text-slate-500">({m.skipReason.split(",").map((r) => SKIP_REASON[r] ?? r).join(", ")})</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">״התקבלה אצל הספק״ אינה הוכחת מסירה. במצב ״לא ידוע״ ההודעה לא נשלחת שוב אוטומטית.</p>
        </Card>
      )}
    </>
  );
}
