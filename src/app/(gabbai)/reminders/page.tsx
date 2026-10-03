import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { planConfig } from "@/server/config";
import { nextSendWindow, policyOf } from "@/server/reminders/calendar";
import { SKIP_TEXT } from "@/server/reminders/service";
import { Bell, CalendarClock, History, MessageCircle, Send, SlidersHorizontal } from "lucide-react";
import { Avatar, Badge, Card, Empty, LinkButton, Money, PageHeader, fmtDateTime } from "@/components/ui";
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
      <PageHeader title="תזכורות והודעות" icon={Bell} subtitle="אתם מחליטים מתי נשלחות תזכורות – אוטומטית, ידנית לכולם, או אחד-אחד מהוואטסאפ שלכם." />
      <Card
        title="מדיניות נוכחית"
        icon={SlidersHorizontal}
        actions={
          <LinkButton href="/settings/reminders" variant="secondary" size="sm">
            שינוי
          </LinkButton>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">תזכורות אוטומטיות</span>
          {tenant.remindersEnabled ? <Badge tone="green" dot>פעילות</Badge> : <Badge tone="red" dot>כבויות</Badge>}
        </div>
        {tenant.remindersEnabled ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <PolicyItem label="תזכורת ראשונה" value={`${tenant.reminderFirstDelayDays} ימים אחרי מועד התשלום`} />
            <PolicyItem label="מרווח" value={`לכל היותר אחת ל-${tenant.reminderIntervalDays} ימים`} />
            <PolicyItem label="ימים ושעה" value={<>{policy.days.map((d) => DAY[d]).join(" ")} · <span className="num">{String(policy.hour).padStart(2, "0")}:{String(policy.minute).padStart(2, "0")}</span>{policy.skipHolidays ? " · לא בחגים" : ""}</>} />
            <PolicyItem label="חלון השליחה הבא" value={next ? fmtDateTime(next) : "—"} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-600">נשלחות רק תזכורות שאתם שולחים ידנית.</p>
        )}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500">
            <span>מכסת הודעות חודשית</span>
            <span className="num">{sub?.messagesUsed ?? 0} / {planConfig().monthlyMessageQuota}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.round(((sub?.messagesUsed ?? 0) / Math.max(1, planConfig().monthlyMessageQuota)) * 100))}%` }} />
          </div>
        </div>
      </Card>
      <Card title="שליחה ידנית" icon={Send}>
        <p className="mb-3 text-sm text-slate-600">
          אפשר לשלוח תזכורת בכל רגע – כאן לכל בעלי החוב, או מתוך כרטיס מתפלל למתפלל אחד. לא נשלחת הודעה למי שלא נתן הסכמה, ביקש להפסיק או שאין לו חוב.
        </p>
        <BulkReminder />
      </Card>
      <Card title="שליחה מהוואטסאפ שלי" icon={MessageCircle} description={`${shareList.length} בעלי חוב`}>
        <p className="mb-3 text-sm text-slate-600">
          בלי חשבון וואטסאפ עסקי: לוחצים ליד כל שם, נפתח הוואטסאפ שלכם עם הודעה מוכנה וקישור אישי, ולוחצים ״שלח״. מי שביקש להפסיק הודעות לא מופיע כאן.
        </p>
        {shareList.length === 0 ? (
          <Empty>אין בעלי חוב עם טלפון.</Empty>
        ) : (
          <ul className="-mx-2 divide-y divide-slate-100">
            {shareList.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-2 py-2.5 text-sm">
                <Avatar name={p.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <Link href={`/congregants/${p.id}`} className="block truncate font-medium hover:text-brand-700 hover:underline">{p.name}</Link>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Money agorot={p.debt} className="font-semibold text-red-700" />
                    {p.recent && <Badge tone="green">נשלחה ב-24 שעות</Badge>}
                    {p.pending && <Badge tone="amber">תשלום ממתין לאישור</Badge>}
                  </span>
                </span>
                <ShareToWhatsAppButton congregantId={p.id} label="שליחה" compact />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="מתוזמנות" icon={CalendarClock} description={`${scheduled.length} תזכורות ממתינות`}>
        {scheduled.length === 0 ? (
          <Empty icon={CalendarClock}>אין תזכורות ממתינות.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {scheduled.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <Badge>{TRIGGER[m.trigger] ?? m.trigger}</Badge>
                <Link href={`/congregants/${m.congregantId}`} className="text-brand-700 hover:underline">{names.get(m.congregantId)}</Link>
                <span className="text-slate-500">{fmtDateTime(m.scheduledFor)}</span>
                {m.kind === "reminder" && <CancelReminder id={m.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="היסטוריה" icon={History}>
        {msgs.length === 0 ? (
          <Empty icon={History}>עדיין לא נשלחו הודעות.</Empty>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 text-sm">
              {msgs.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <Badge>{KIND[m.kind] ?? m.kind}{m.kind === "reminder" ? ` · ${TRIGGER[m.trigger] ?? m.trigger}` : ""}</Badge>
                  <Link href={`/congregants/${m.congregantId}`} className="font-medium text-brand-700 hover:underline">{names.get(m.congregantId)}</Link>
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

function PolicyItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
