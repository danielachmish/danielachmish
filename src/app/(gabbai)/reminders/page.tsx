import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { planConfig } from "@/server/config";
import { nextSendWindow, policyOf } from "@/server/reminders/calendar";
import { SKIP_TEXT } from "@/server/reminders/service";
import { Badge, Card, Empty, LinkButton, Money, fmtDateTime } from "@/components/ui";
import { MSG_STATUS } from "@/components/labels";
import { BulkReminder, CancelReminder } from "@/components/gabbai/reminder-controls";
import { ShareToWhatsAppButton } from "@/components/gabbai/share-button";
import { shareCandidates } from "@/server/reminders/share";

const KIND: Record<string, string> = { reminder: "תזכורת", confirmation: "אישור תשלום", menu_reply: "מענה בוואטסאפ", otp: "קוד" };
const TRIGGER: Record<string, string> = { auto: "אוטומטית", manual: "ידנית", manual_bulk: "ידנית (לכולם)" };
const DAY = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export default async function Reminders() {
  const g = await requireGabbai();
  const { msgs, scheduled, names, sub, tenant, shareList } = await withContext(g.ctx, async (tx) => {
    const shareList = await shareCandidates(tx);
    const msgs = await tx.outboundMessage.findMany({ where: { status: { not: "scheduled" } }, orderBy: { createdAt: "desc" }, take: 100 });
    const scheduled = await tx.outboundMessage.findMany({ where: { status: "scheduled" }, orderBy: { scheduledFor: "asc" }, take: 200 });
    const ids = [...new Set([...msgs, ...scheduled].map((m) => m.congregantId))];
    const people = await tx.congregant.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    return {
      msgs,
      scheduled,
      names: new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`])),
      sub: await tx.saaSSubscription.findUnique({ where: { tenantId: g.tenantId } }),
      tenant: await tx.tenant.findUniqueOrThrow({ where: { id: g.tenantId } }),
      shareList,
    };
  });
  const policy = policyOf(tenant);
  const next = tenant.remindersEnabled && policy.days.length ? nextSendWindow(new Date(), policy) : null;
  return (
    <>
      <h1 className="text-2xl font-bold">תזכורות והודעות</h1>
      <Card title="מדיניות נוכחית" actions={<LinkButton href="/settings#reminders" variant="secondary">שינוי</LinkButton>}>
        {tenant.remindersEnabled ? (
          <p className="text-sm">
            תזכורות אוטומטיות <Badge tone="green">פעילות</Badge> · ראשונה {tenant.reminderFirstDelayDays} ימים אחרי מועד התשלום, אחר כך לכל היותר אחת ל-{tenant.reminderIntervalDays} ימים ·
            ימים {policy.days.map((d) => DAY[d]).join(" ")} בשעה <span className="num">{String(policy.hour).padStart(2, "0")}:{String(policy.minute).padStart(2, "0")}</span>
            {policy.skipHolidays ? " · לא בחגים" : ""}
            {next && <> · חלון השליחה הבא: {fmtDateTime(next)}</>}
          </p>
        ) : (
          <p className="text-sm">תזכורות אוטומטיות <Badge tone="red">כבויות</Badge> – נשלחות רק תזכורות שאתם שולחים ידנית.</p>
        )}
        <p className="mt-2 text-sm">מכסת הודעות חודשית: <span className="num">{sub?.messagesUsed ?? 0} / {planConfig().monthlyMessageQuota}</span></p>
      </Card>
      <Card title="שליחה ידנית">
        <p className="mb-3 text-sm text-slate-600">
          אפשר לשלוח תזכורת בכל רגע – כאן לכל בעלי החוב, או מתוך כרטיס מתפלל למתפלל אחד. לא נשלחת הודעה למי שלא נתן הסכמה, ביקש להפסיק או שאין לו חוב.
        </p>
        <BulkReminder />
      </Card>
      <Card title={`שליחה מהוואטסאפ שלי (${shareList.length} בעלי חוב)`}>
        <p className="mb-3 text-sm text-slate-600">
          בלי חשבון וואטסאפ עסקי: לוחצים ליד כל שם, נפתח הוואטסאפ שלכם עם הודעה מוכנה וקישור אישי, ולוחצים ״שלח״. מי שביקש להפסיק הודעות לא מופיע כאן.
        </p>
        {shareList.length === 0 ? (
          <Empty>אין בעלי חוב עם טלפון.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shareList.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/congregants/${p.id}`} className="text-brand-700 hover:underline">{p.name}</Link>
                  <Money agorot={p.debt} />
                  {p.recent && <Badge tone="green">נשלחה ב-24 שעות</Badge>}
                  {p.pending && <Badge tone="amber">תשלום ממתין לאישור</Badge>}
                </span>
                <ShareToWhatsAppButton congregantId={p.id} label="שליחה" compact />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`מתוזמנות (${scheduled.length})`}>
        {scheduled.length === 0 ? (
          <Empty>אין תזכורות ממתינות.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {scheduled.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge>{TRIGGER[m.trigger] ?? m.trigger}</Badge>
                <Link href={`/congregants/${m.congregantId}`} className="text-brand-700 hover:underline">{names.get(m.congregantId)}</Link>
                <span className="text-slate-500">{fmtDateTime(m.scheduledFor)}</span>
                {m.kind === "reminder" && <CancelReminder id={m.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="היסטוריה">
        {msgs.length === 0 ? (
          <Empty>עדיין לא נשלחו הודעות.</Empty>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 text-sm">
              {msgs.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge>{KIND[m.kind] ?? m.kind}{m.kind === "reminder" ? ` · ${TRIGGER[m.trigger] ?? m.trigger}` : ""}</Badge>
                  <Link href={`/congregants/${m.congregantId}`} className="text-brand-700 hover:underline">{names.get(m.congregantId)}</Link>
                  <span className="text-slate-500">{fmtDateTime(m.attemptedAt ?? m.scheduledFor)}</span>
                  <Badge tone={m.status === "failed" || m.status === "unknown" ? "red" : m.status === "skipped" ? "slate" : "green"}>{MSG_STATUS[m.status] ?? m.status}</Badge>
                  {m.skipReason && <span className="text-slate-500">({m.skipReason.split(",").map((r) => SKIP_TEXT[r] ?? r).join(", ")})</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">״התקבלה אצל הספק״ אינה הוכחת מסירה. במצב ״לא ידוע״ ההודעה לא נשלחת שוב אוטומטית.</p>
          </>
        )}
      </Card>
    </>
  );
}
