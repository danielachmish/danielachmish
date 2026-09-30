import { cookies } from "next/headers";
import { z } from "zod";
import { portalIdentity } from "@/server/portal/links";
import { portalOverview } from "@/server/portal/actions";
import { Alert, Badge, Card, METHOD_LABEL, Money, STATUS_LABEL, fmtDate } from "@/components/ui";
import { PORTAL_COOKIE } from "@/server/portal/cookie";
import { PayPanel, ReportPanel, InquiryPanel, OptOutButton } from "./panels";

export default async function Me({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const p = await portalIdentity((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!p)
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <Alert tone="warn">כדי לצפות בפרטים יש לפתוח את הקישור האישי שקיבלתם ולאמת בקוד.</Alert>
      </main>
    );
  const { c } = await searchParams;
  const cid = c && z.uuid().safeParse(c).success && p.congregantIds.includes(c) ? c : p.primaryCongregantId;
  const o = await portalOverview(p, cid);
  const open = o.pledges.filter((x) => x.outstanding > 0);
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <header>
        <p className="text-sm text-slate-500">{o.synagogueName}</p>
        <h1 className="text-2xl font-bold">{o.name}</h1>
      </header>
      {o.cards.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="כרטיסים">
          {o.cards.map((x) => (
            <a key={x.id} href={`/me?c=${x.id}`} className={`rounded-full border px-3 py-1 text-sm ${x.id === cid ? "border-brand-600 bg-brand-50" : "border-slate-300"}`}>{x.firstName} {x.lastName}</a>
          ))}
        </nav>
      )}
      <Card>
        <p className="text-sm text-slate-500">יתרה לתשלום</p>
        <Money agorot={o.summary.debtAgorot} className="text-3xl font-bold" />
        {o.summary.creditAgorot > 0 && <p className="mt-1 text-sm text-green-700">זכות: <Money agorot={o.summary.creditAgorot} /></p>}
        {o.summary.pendingExternalAgorot > 0 && <p className="mt-1 text-sm text-amber-800">ממתין לאישור הגבאי: <Money agorot={o.summary.pendingExternalAgorot} /></p>}
        {o.openTasks > 0 && <p className="mt-1 text-sm text-slate-600">יש פנייה פתוחה בטיפול הגבאי.</p>}
      </Card>
      {o.summary.debtAgorot > 0 && <PayPanel congregantId={cid} debtAgorot={o.summary.debtAgorot} allowPartial={o.options.portalPartialPayment} allowSelect={o.options.portalSelectPledges} minPartialAgorot={o.options.portalMinPartialAgorot} pledges={open.map((x) => ({ id: x.id, label: `${fmtDate(x.date)} ${x.description ?? (x.kind === "opening_balance" ? "יתרת פתיחה" : "נדר")}`, outstanding: x.outstanding }))} />}
      <Card title="נדרים">
        <ul className="divide-y divide-slate-100 text-sm">
          {o.pledges.map((x) => (
            <li key={x.id} className="flex justify-between gap-2 py-2">
              <span>{fmtDate(x.date)} · {x.description ?? (x.kind === "opening_balance" ? "יתרת פתיחה" : "נדר")}</span>
              <span>{x.outstanding > 0 ? <>נותר <Money agorot={x.outstanding} /> מתוך <Money agorot={x.effective} /></> : <Badge tone="green">שולם</Badge>}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="תשלומים">
        {o.payments.length === 0 ? <p className="text-sm text-slate-500">אין תשלומים.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {o.payments.map((x) => (
              <li key={x.id} className="flex justify-between gap-2 py-2">
                <span>{fmtDate(x.receivedAt)} · {METHOD_LABEL[x.method]}</span>
                <span><Money agorot={x.amountAgorot} /> <Badge tone={x.status === "confirmed" ? "green" : x.status === "rejected" ? "red" : "amber"}>{STATUS_LABEL[x.status]}</Badge></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {o.options.portalReportExternalPayment && <ReportPanel congregantId={cid} />}
      {o.options.portalInquiry && <InquiryPanel congregantId={cid} />}
      {!o.optedOut ? <OptOutButton congregantId={cid} /> : <p className="text-sm text-slate-500">ביקשת לא לקבל תזכורות.</p>}
    </main>
  );
}
