import { notFound } from "next/navigation";
import { z } from "zod";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { loadCard, paymentFigures, pledgeFigures } from "@/server/ledger/balance";
import { displayPhone } from "@/server/util/phone";
import Link from "next/link";
import { ArrowRight, Banknote, CreditCard, ListChecks, Mail, MessageCircle, NotebookPen, Phone, PiggyBank, Plus, Smartphone, UserPen, UsersRound } from "lucide-react";
import { Avatar, Badge, Card, Disclosure, Empty, METHOD_LABEL, Money, STATUS_LABEL, fmtDate, fmtDateTime } from "@/components/ui";
import { CongregantForm } from "@/components/gabbai/congregant-form";
import {
  AddPledgeForm,
  AdjustPledgeForm,
  AppInviteButtons,
  RevokeAccountButton,
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
import { cardAccounts } from "@/server/accounts/invites";

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
    const app = await cardAccounts(tx, id);
    return { c, card, consent, family, tasks, messages, share, app };
  });
  if (!data) notFound();
  const { c, card, consent, family, tasks, share, app } = data;
  const s = card.summary;
  const pledgeName = new Map(card.pledges.map((p) => [p.id, `${fmtDate(p.pledgeDate)} ${p.description ?? p.category ?? ""}`.trim()]));

  return (
    <>
      <Link href="/congregants" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700">
        <ArrowRight className="size-4" aria-hidden /> כל המתפללים
      </Link>

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-l from-brand-50 via-white to-white p-5 sm:p-6">
          <Avatar name={`${c.firstName} ${c.lastName}`} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight">
              {c.firstName} {c.lastName}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              {c.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-4 text-slate-400" aria-hidden />
                  <span className="num">{displayPhone(c.phone)}</span>
                </span>
              )}
              {c.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-4 text-slate-400" aria-hidden />
                  <span dir="ltr">{c.email}</span>
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {consent?.granted && !c.messagingOptOut ? <Badge tone="green" dot>מסכים להודעות</Badge> : <Badge dot>אין הסכמה להודעות</Badge>}
              {c.messagingOptOut && <Badge tone="red" dot>ביקש להפסיק הודעות</Badge>}
              {app.accounts.length > 0 && <Badge tone="blue" dot>מחובר לאפליקציה</Badge>}
              {tasks.length > 0 && <Badge tone="amber" dot>{tasks.length} משימות פתוחות</Badge>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-100 border-t border-slate-100">
          <Summary label="חוב פתוח" agorot={s.debtAgorot} tone={s.debtAgorot > 0 ? "text-red-700" : "text-slate-900"} />
          <Summary label="זכות" agorot={s.creditAgorot} tone={s.creditAgorot > 0 ? "text-emerald-700" : "text-slate-900"} />
          <Summary label="ממתין לאישור" agorot={s.pendingExternalAgorot} tone="text-slate-900" />
        </div>
      </section>

      {s.creditAgorot > 0 && s.debtAgorot > 0 && (
        <Card title="יש לכרטיס זכות וגם חוב" icon={PiggyBank} tone="brand">
          <ApplyCreditButton congregantId={c.id} />
        </Card>
      )}

      {tasks.length > 0 && (
        <Card title="משימות פתוחות לכרטיס" icon={ListChecks} tone="warn">
          <ul className="space-y-2 text-sm">
            {tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="gold">{TASK_LABEL[t.kind] ?? t.kind}</Badge> {t.summary}{" "}
                {t.pausesReminders && <span className="text-slate-500">(תזכורות מושהות)</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="נדרים והתחייבויות" icon={NotebookPen} description={card.pledges.length ? `${card.pledges.length} רשומות` : undefined}>
            {card.pledges.length === 0 ? (
              <Empty icon={NotebookPen}>אין נדרים רשומים.</Empty>
            ) : (
              <ul className="space-y-3">
                {card.pledges.map((p) => {
                  const f = pledgeFigures(p);
                  const pct = f.effective > 0 ? Math.min(100, Math.round((f.allocated / f.effective) * 100)) : 100;
                  return (
                    <li key={p.id} className="rounded-xl border border-slate-200 p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {p.kind === "opening_balance" ? "יתרת פתיחה" : p.description || p.category || "נדר"}
                            {p.category && p.description && <span className="ms-2 text-sm font-normal text-slate-500">{p.category}</span>}
                          </p>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {fmtDate(p.pledgeDate)}
                            {p.dueDate && <> · לתשלום עד {fmtDate(p.dueDate)}</>}
                          </p>
                        </div>
                        <div className="text-end">
                          {f.outstanding > 0 ? (
                            <>
                              <Money agorot={f.outstanding} className="block text-lg font-bold text-red-700" />
                              <span className="text-xs text-slate-500">
                                נותר מתוך <Money agorot={f.effective} />
                              </span>
                            </>
                          ) : (
                            <Badge tone="green" dot>
                              שולם <Money agorot={f.effective} />
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">
                        סכום <Money agorot={f.effective} /> · שולם <Money agorot={f.allocated} /> · נותר <Money agorot={f.outstanding} />
                      </p>
                      {p.adjustments.map((a) => (
                        <p key={a.id} className="mt-1 text-xs text-slate-500">
                          תיקון <Money agorot={a.deltaAgorot} /> ({a.reason}) · {fmtDateTime(a.createdAt)}
                        </p>
                      ))}
                      {p.internalNote && <p className="mt-1 text-xs text-slate-500">הערה: {p.internalNote}</p>}
                      <div className="mt-2">
                        <AdjustPledgeForm pledgeId={p.id} congregantId={c.id} paidAgorot={f.allocated} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="רישום נדר" icon={Plus}>
            <AddPledgeForm congregantId={c.id} />
          </Card>

          <Card title="תשלומים והקצאות" icon={CreditCard}>
            {card.payments.length === 0 ? (
              <Empty icon={CreditCard}>אין תשלומים.</Empty>
            ) : (
              <ul className="space-y-3">
                {card.payments.map((p) => {
                  const f = paymentFigures(p);
                  return (
                    <li key={p.id} className="rounded-xl border border-slate-200 p-3.5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 font-semibold">
                          <Money agorot={p.amountAgorot} className="text-base" />
                          <span className="font-normal text-slate-500">
                            {METHOD_LABEL[p.method]} · {fmtDate(p.receivedAt)}
                          </span>
                        </p>
                        <Badge tone={p.status === "confirmed" ? "green" : p.status === "rejected" ? "red" : "amber"} dot>
                          {STATUS_LABEL[p.status]}
                        </Badge>
                      </div>
                      {f.refunded > 0 && (
                        <p className="mt-1 text-slate-600">
                          הוחזר <Money agorot={f.refunded} />
                        </p>
                      )}
                      {p.allocations.length > 0 && (
                        <ul className="mt-2 space-y-0.5 border-s-2 border-slate-100 ps-3 text-slate-600">
                          {p.allocations.map((a) => (
                            <li key={a.id}>
                              {REASON[a.reason] ?? a.reason}: <Money agorot={a.amountAgorot} /> ← {pledgeName.get(a.pledgeId)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {p.status === "confirmed" && f.credit > 0 && (
                        <p className="mt-1 text-emerald-700">
                          יתרת זכות מתשלום זה: <Money agorot={f.credit} />
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="רישום תשלום במזומן / העברה / צ׳ק" icon={Banknote}>
            <ExternalPaymentForm congregantId={c.id} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="תזכורות והודעות" icon={MessageCircle}>
            <div className="space-y-3">
              <ConsentButtons congregantId={c.id} granted={!!consent?.granted && !c.messagingOptOut} hasPhone={!!c.phone} />
              {consent?.granted && <p className="text-xs text-slate-500">הסכמה ניתנה {fmtDate(consent.createdAt)}</p>}
              {s.debtAgorot > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  {share.hard.length === 0 && c.phone && (
                    <div className="space-y-1">
                      <ShareToWhatsAppButton congregantId={c.id} />
                      <p className="text-xs text-slate-500">נפתח הוואטסאפ שלך עם הודעה מוכנה וקישור אישי – בלי חשבון עסקי.</p>
                      {share.soft.length > 0 && <p className="text-xs text-gold-700">שימו לב: {share.soft.map((r) => SKIP_TEXT[r]).join(", ")}.</p>}
                    </div>
                  )}
                  <SendReminderNow congregantId={c.id} />
                </div>
              )}
              <div className="border-t border-slate-100 pt-3">
                <PersonalLinkButtons congregantId={c.id} />
              </div>
            </div>
          </Card>

          <Card title="גישה לאפליקציה" icon={Smartphone}>
            {app.accounts.length > 0 ? (
              <ul className="mb-3 space-y-2 text-sm">
                {app.accounts.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <span className="min-w-0">
                      <span dir="ltr" className="block truncate font-medium">
                        {x.email}
                      </span>
                      {x.verified ? <Badge tone="green">מחובר מ-{fmtDate(x.since)}</Badge> : <Badge tone="amber">ממתין לאימות דוא״ל</Badge>}
                    </span>
                    <RevokeAccountButton accountId={x.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-slate-600">למתפלל אין עדיין חשבון. אחרי ההזמנה הוא בוחר סיסמה ונכנס עם הדוא״ל שלו – ורואה רק את הכרטיס שלו.</p>
            )}
            {app.pendingInvite && (
              <p className="mb-2 text-xs text-slate-500">
                נשלחה הזמנה{app.pendingInvite.sentToEmail ? <> ל-<span dir="ltr">{app.pendingInvite.sentToEmail}</span></> : null}, בתוקף עד {fmtDate(app.pendingInvite.expiresAt)}.
              </p>
            )}
            <AppInviteButtons congregantId={c.id} phone={c.phone} hasEmail={!!c.email} />
          </Card>

          <Card title="הרשאות משפחה" icon={UsersRound}>
            {family.length > 0 && (
              <ul className="mb-2 space-y-1 text-sm">
                {family.map((f) => (
                  <li key={f.id} className="num rounded-lg bg-slate-50 px-3 py-1.5 text-right">
                    {displayPhone(f.phone)}
                  </li>
                ))}
              </ul>
            )}
            <p className="mb-2 text-xs text-slate-500">הרשאה לצפות ולשלם בכרטיס זה ניתנת רק במפורש – לא לפי שם משפחה.</p>
            <FamilyAccessForm congregantId={c.id} />
          </Card>

          <Disclosure title="עריכת פרטי מתפלל" icon={UserPen}>
            <CongregantForm
              initial={{ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: displayPhone(c.phone), email: c.email ?? "", notes: c.notes ?? "" }}
            />
          </Disclosure>
        </div>
      </div>
    </>
  );
}

function Summary({ label, agorot, tone = "" }: { label: string; agorot: number; tone?: string }) {
  return (
    <div className="px-3 py-4 text-center" data-testid={`summary-${label}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <Money agorot={agorot} className={`mt-0.5 block text-xl font-bold sm:text-2xl ${tone}`} />
    </div>
  );
}
