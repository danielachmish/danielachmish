import { z } from "zod";
import { CheckCircle2, Clock, CreditCard, NotebookPen } from "lucide-react";
import { otherSynagogues } from "@/server/portal/links";
import { currentPortal, switchableSynagogues } from "@/server/portal/current";
import { portalOverview } from "@/server/portal/actions";
import { Alert, Badge, Card, Empty, METHOD_LABEL, Money, STATUS_LABEL, fmtDate } from "@/components/ui";
import { AuthShell, BrandMark } from "@/components/brand";
import { loginSettings } from "@/server/auth/login-settings";
import { PayPanel, ReportPanel, InquiryPanel, OptOutButton, SwitchSynagogue, MeSignOut } from "./panels";

export default async function Me({ searchParams }: { searchParams: Promise<{ c?: string; t?: string }> }) {
  const { c, t } = await searchParams;
  const p = await currentPortal({ tenantId: t && z.uuid().safeParse(t).success ? t : undefined, congregantId: c });
  if (!p) {
    const phone = (await loginSettings()).phoneLogin;
    return (
      <AuthShell title="העמוד האישי">
        <Alert tone="warn">
          כדי לצפות בפרטים יש <a href="/login" className="font-medium underline">להיכנס לחשבון</a>
          {phone && <> או <a href="/enter" className="font-medium underline">להיכנס עם מספר הטלפון</a></>} – או לפתוח את הקישור האישי שקיבלתם.
        </Alert>
      </AuthShell>
    );
  }
  const cid = c && z.uuid().safeParse(c).success && p.congregantIds.includes(c) ? c : p.primaryCongregantId;
  const o = await portalOverview(p, cid);
  const open = o.pledges.filter((x) => x.outstanding > 0);
  const others = (await switchableSynagogues(p)) ?? (await otherSynagogues(p));
  const debt = o.summary.debtAgorot;
  return (
    <div className="min-h-dvh">
      <div className="bg-gradient-to-b from-brand-900 via-brand-800 to-brand-700 pb-20 text-white">
        <header className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="size-9" />
            <p className="truncate text-sm text-brand-100">{o.synagogueName}</p>
          </div>
          <div className="[&_button]:text-white [&_button:hover]:bg-white/10">
            <MeSignOut account={p.via === "account"} />
          </div>
        </header>
        <div className="mx-auto max-w-lg px-4 pt-6">
          <p className="text-brand-200">שלום,</p>
          <h1 className="text-3xl font-bold">{o.name}</h1>
        </div>
      </div>

      <main className="mx-auto -mt-14 max-w-lg space-y-4 px-4 pb-12">
        <section className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-raised">
          <p className="text-sm font-medium text-slate-500">יתרה לתשלום</p>
          {debt > 0 ? (
            <Money agorot={debt} className="mt-1 block text-4xl font-bold text-slate-900" />
          ) : (
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold text-emerald-700">
              <CheckCircle2 className="size-7" aria-hidden /> אין חוב פתוח
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {o.summary.creditAgorot > 0 && (
              <Badge tone="green" dot>
                זכות: <Money agorot={o.summary.creditAgorot} />
              </Badge>
            )}
            {o.summary.pendingExternalAgorot > 0 && (
              <Badge tone="amber" dot>
                ממתין לאישור הגבאי: <Money agorot={o.summary.pendingExternalAgorot} />
              </Badge>
            )}
            {o.openTasks > 0 && <Badge tone="blue" dot>יש פנייה פתוחה בטיפול הגבאי</Badge>}
          </div>
        </section>

        {others.length > 0 && <SwitchSynagogue current={o.synagogueName} others={others} />}
        {o.cards.length > 1 && (
          <nav className="flex flex-wrap gap-2" aria-label="כרטיסים">
            {o.cards.map((x) => (
              <a
                key={x.id}
                href={`/me?t=${p.tenantId}&c=${x.id}`}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${x.id === cid ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}
              >
                {x.firstName} {x.lastName}
              </a>
            ))}
          </nav>
        )}

        {debt > 0 && (
          <PayPanel
            congregantId={cid}
            debtAgorot={debt}
            allowPartial={o.options.portalPartialPayment}
            allowSelect={o.options.portalSelectPledges}
            minPartialAgorot={o.options.portalMinPartialAgorot}
            pledges={open.map((x) => ({ id: x.id, label: `${fmtDate(x.date)} ${x.description ?? (x.kind === "opening_balance" ? "יתרת פתיחה" : "נדר")}`, outstanding: x.outstanding }))}
          />
        )}

        <Card title="נדרים" icon={NotebookPen}>
          {o.pledges.length === 0 ? (
            <Empty icon={NotebookPen}>אין נדרים רשומים.</Empty>
          ) : (
            <ul className="-mx-1 divide-y divide-slate-100 text-sm">
              {o.pledges.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 px-1 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{x.description ?? (x.kind === "opening_balance" ? "יתרת פתיחה" : "נדר")}</span>
                    <span className="block text-xs text-slate-500">{fmtDate(x.date)}</span>
                  </span>
                  <span className="text-end">
                    {x.outstanding > 0 ? (
                      <>
                        <Money agorot={x.outstanding} className="block font-semibold text-red-700" />
                        <span className="text-xs text-slate-500">
                          נותר מתוך <Money agorot={x.effective} />
                        </span>
                      </>
                    ) : (
                      <Badge tone="green" dot>
                        שולם
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="תשלומים" icon={CreditCard}>
          {o.payments.length === 0 ? (
            <Empty icon={CreditCard}>אין תשלומים.</Empty>
          ) : (
            <ul className="-mx-1 divide-y divide-slate-100 text-sm">
              {o.payments.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 px-1 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{METHOD_LABEL[x.method]}</span>
                    <span className="block text-xs text-slate-500">{fmtDate(x.receivedAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Money agorot={x.amountAgorot} className="font-semibold" />
                    <Badge tone={x.status === "confirmed" ? "green" : x.status === "rejected" ? "red" : "amber"}>
                      {x.status === "pending_approval" && <Clock className="size-3" aria-hidden />}
                      {STATUS_LABEL[x.status]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-2">
          {o.options.portalReportExternalPayment && <ReportPanel congregantId={cid} />}
          {o.options.portalInquiry && <InquiryPanel congregantId={cid} />}
        </div>
        <div className="pt-2 text-center">
          {!o.optedOut ? <OptOutButton congregantId={cid} /> : <p className="text-sm text-slate-500">ביקשת לא לקבל תזכורות.</p>}
        </div>
      </main>
    </div>
  );
}
