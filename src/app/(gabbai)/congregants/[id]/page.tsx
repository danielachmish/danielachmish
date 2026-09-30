import { notFound } from "next/navigation";
import { z } from "zod";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { loadCard, paymentFigures, pledgeFigures } from "@/server/ledger/balance";
import { displayPhone } from "@/server/util/phone";
import { Badge, Card, Empty, METHOD_LABEL, Money, STATUS_LABEL, fmtDate, fmtDateTime } from "@/components/ui";
import { CongregantForm } from "@/components/gabbai/congregant-form";
import {
  AddPledgeForm,
  AdjustPledgeForm,
  ConsentButtons,
  ExternalPaymentForm,
  FamilyAccessForm,
  PersonalLinkButtons,
} from "@/components/gabbai/card-actions";
import { TASK_LABEL } from "@/components/labels";
import { ApplyCreditButton, SendReminderNow } from "@/components/gabbai/reminder-controls";
import { ShareToWhatsAppButton } from "@/components/gabbai/share-button";
import { shareWarnings } from "@/server/reminders/share";
import { SKIP_TEXT } from "@/server/reminders/service";

const REASON: Record<string, string> = { payment: "תשלום", credit_apply: "שימוש בזכות", refund: "החזר", pledge_reduction: "הפחתת נדר" };

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const g = await requireGabbai();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await withContext(g.ctx, async (tx) => {
    const c = await tx.congregant.findUnique({ where: { id } });
    if (!c) return null;
    const card = await loadCard(tx, id);
    const consent = await tx.consent.findFirst({ where: { congregantId: id }, orderBy: { createdAt: "desc" } });
    const family = await tx.contactPermission.findMany({ where: { congregantId: id, revokedAt: null, relation: "family" } });
    const tasks = await tx.task.findMany({ where: { congregantId: id, status: "open" } });
    const messages = await tx.outboundMessage.findMany({ where: { congregantId: id }, orderBy: { createdAt: "desc" }, take: 5 });
    const share = await shareWarnings(tx, g.tenantId, id);
    return { c, card, consent, family, tasks, messages, share };
  });
  if (!data) notFound();
  const { c, card, consent, family, tasks, share } = data;
  const s = card.summary;
  const pledgeName = new Map(card.pledges.map((p) => [p.id, `${fmtDate(p.pledgeDate)} ${p.description ?? p.category ?? ""}`.trim()]));

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {c.firstName} {c.lastName}
        </h1>
        <span className="num text-slate-500">{displayPhone(c.phone)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Summary label="חוב פתוח" agorot={s.debtAgorot} tone={s.debtAgorot > 0 ? "text-red-700" : ""} />
        <Summary label="זכות" agorot={s.creditAgorot} tone={s.creditAgorot > 0 ? "text-green-700" : ""} />
        <Summary label="ממתין לאישור" agorot={s.pendingExternalAgorot} />
      </div>

      {s.creditAgorot > 0 && s.debtAgorot > 0 && (
        <Card title="יש לכרטיס זכות וגם חוב">
          <ApplyCreditButton congregantId={c.id} />
        </Card>
      )}

      {tasks.length > 0 && (
        <Card title="משימות פתוחות לכרטיס">
          <ul className="space-y-1 text-sm">
            {tasks.map((t) => (
              <li key={t.id}>
                <Badge tone="amber">{TASK_LABEL[t.kind] ?? t.kind}</Badge> {t.summary} {t.pausesReminders && <span className="text-slate-500">(תזכורות מושהות)</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="נדרים והתחייבויות">
        {card.pledges.length === 0 ? (
          <Empty>אין נדרים רשומים.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {card.pledges.map((p) => {
              const f = pledgeFigures(p);
              return (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {p.kind === "opening_balance" ? "יתרת פתיחה" : p.description || p.category || "נדר"}{" "}
                        <span className="text-sm text-slate-500">· {fmtDate(p.pledgeDate)}</span>
                      </p>
                      <p className="text-sm text-slate-600">
                        סכום <Money agorot={f.effective} /> · שולם <Money agorot={f.allocated} /> · נותר{" "}
                        <Money agorot={f.outstanding} className={f.outstanding > 0 ? "font-semibold text-red-700" : ""} />
                        {p.dueDate && <> · לתשלום עד {fmtDate(p.dueDate)}</>}
                      </p>
                      {p.adjustments.map((a) => (
                        <p key={a.id} className="text-xs text-slate-500">
                          תיקון <Money agorot={a.deltaAgorot} /> ({a.reason}) · {fmtDateTime(a.createdAt)}
                        </p>
                      ))}
                      {p.internalNote && <p className="text-xs text-slate-500">הערה: {p.internalNote}</p>}
                    </div>
                    <AdjustPledgeForm pledgeId={p.id} congregantId={c.id} paidAgorot={f.allocated} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="רישום נדר">
        <AddPledgeForm congregantId={c.id} />
      </Card>

      <Card title="תשלומים והקצאות">
        {card.payments.length === 0 ? (
          <Empty>אין תשלומים.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {card.payments.map((p) => {
              const f = paymentFigures(p);
              return (
                <li key={p.id} className="py-3 text-sm">
                  <p className="font-medium">
                    <Money agorot={p.amountAgorot} /> · {METHOD_LABEL[p.method]} · {fmtDate(p.receivedAt)}{" "}
                    <Badge tone={p.status === "confirmed" ? "green" : p.status === "rejected" ? "red" : "amber"}>{STATUS_LABEL[p.status]}</Badge>
                  </p>
                  {f.refunded > 0 && (
                    <p className="text-slate-600">
                      הוחזר <Money agorot={f.refunded} />
                    </p>
                  )}
                  {p.allocations.map((a) => (
                    <p key={a.id} className="text-slate-600">
                      {REASON[a.reason] ?? a.reason}: <Money agorot={a.amountAgorot} /> ← {pledgeName.get(a.pledgeId)}
                    </p>
                  ))}
                  {p.status === "confirmed" && f.credit > 0 && (
                    <p className="text-green-700">
                      יתרת זכות מתשלום זה: <Money agorot={f.credit} />
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="רישום תשלום במזומן / העברה / צ׳ק">
        <ExternalPaymentForm congregantId={c.id} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="הודעות וקישור אישי">
          <p className="mb-2 text-sm">
            הסכמה להודעות:{" "}
            {consent?.granted ? <Badge tone="green">ניתנה {fmtDate(consent.createdAt)}</Badge> : <Badge>לא ניתנה</Badge>}{" "}
            {c.messagingOptOut && <Badge tone="red">ביקש להפסיק הודעות</Badge>}
          </p>
          <ConsentButtons congregantId={c.id} granted={!!consent?.granted && !c.messagingOptOut} hasPhone={!!c.phone} />
          <hr className="my-3 border-slate-100" />
          {s.debtAgorot > 0 && (
            <>
              {share.hard.length === 0 && c.phone && (
                <div className="mb-3 space-y-1">
                  <ShareToWhatsAppButton congregantId={c.id} />
                  <p className="text-xs text-slate-500">נפתח הוואטסאפ שלך עם הודעה מוכנה וקישור אישי – בלי חשבון עסקי.</p>
                  {share.soft.length > 0 && <p className="text-xs text-amber-800">שימו לב: {share.soft.map((r) => SKIP_TEXT[r]).join(", ")}.</p>}
                </div>
              )}
              <SendReminderNow congregantId={c.id} />
              <hr className="my-3 border-slate-100" />
            </>
          )}
          <PersonalLinkButtons congregantId={c.id} />
        </Card>
        <Card title="הרשאות משפחה">
          {family.length > 0 && (
            <ul className="mb-2 text-sm">
              {family.map((f) => (
                <li key={f.id} className="num text-right">
                  {displayPhone(f.phone)}
                </li>
              ))}
            </ul>
          )}
          <p className="mb-2 text-xs text-slate-500">הרשאה לצפות ולשלם בכרטיס זה ניתנת רק במפורש – לא לפי שם משפחה.</p>
          <FamilyAccessForm congregantId={c.id} />
        </Card>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold">עריכת פרטי מתפלל</summary>
        <div className="mt-3">
          <CongregantForm
            initial={{ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: displayPhone(c.phone), email: c.email ?? "", notes: c.notes ?? "" }}
          />
        </div>
      </details>
    </>
  );
}

function Summary({ label, agorot, tone = "" }: { label: string; agorot: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center" data-testid={`summary-${label}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <Money agorot={agorot} className={`text-lg font-bold ${tone}`} />
    </div>
  );
}
