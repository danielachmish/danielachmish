import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { Clock, CreditCard, Scale } from "lucide-react";
import { Avatar, Badge, Card, Empty, LinkButton, METHOD_LABEL, Money, PageHeader, STATUS_LABEL, fmtDate } from "@/components/ui";
import { PaymentDecision } from "@/components/gabbai/decisions";

export default async function Payments() {
  const g = await requireGabbai();
  const { pending, recent } = await withContext(g.ctx, async (tx) => ({
    pending: await tx.payment.findMany({ where: { status: "pending_approval" }, include: { congregant: true }, orderBy: { createdAt: "asc" } }),
    recent: await tx.payment.findMany({ where: { status: { not: "pending_approval" } }, include: { congregant: true, refunds: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  }));
  return (
    <>
      <PageHeader
        title="תשלומים"
        icon={CreditCard}
        actions={
          <LinkButton href="/payments/reconcile" variant="secondary" size="sm">
            <Scale className="size-4" aria-hidden /> התאמה מול דוח הסליקה
          </LinkButton>
        }
      />
      <Card title="ממתינים לאישור" icon={Clock} description={pending.length ? `${pending.length} דיווחים – החוב יורד רק אחרי אישור` : undefined} tone={pending.length ? "warn" : "plain"}>
        {pending.length === 0 ? (
          <Empty icon={Clock}>אין דיווחים שממתינים לאישור.</Empty>
        ) : (
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={p.id} className="rounded-xl border border-gold-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={`${p.congregant.firstName} ${p.congregant.lastName}`} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/congregants/${p.congregantId}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                      {p.congregant.firstName} {p.congregant.lastName}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {METHOD_LABEL[p.method]} {p.reference && <>· אסמכתה <span className="num">{p.reference}</span></>} · דווח {fmtDate(p.createdAt)} ע״י {p.reportedBy === "congregant" ? "המתפלל" : "הגבאי"}
                    </p>
                  </div>
                  <Money agorot={p.amountAgorot} className="text-lg font-bold" />
                </div>
                <div className="mt-3">
                  <PaymentDecision paymentId={p.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="תשלומים אחרונים" icon={CreditCard}>
        {recent.length === 0 ? (
          <Empty icon={CreditCard}>אין תשלומים עדיין.</Empty>
        ) : (
          <>
            <div className="-mx-2 divide-y divide-slate-100 md:hidden">
              {recent.map((p) => (
                <div key={p.id}>
                  <Link href={`/congregants/${p.congregantId}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50">
                    <Avatar name={`${p.congregant.firstName} ${p.congregant.lastName}`} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.congregant.firstName} {p.congregant.lastName}</span>
                      <span className="block text-xs text-slate-500">{METHOD_LABEL[p.method]} · {fmtDate(p.receivedAt)}</span>
                    </span>
                    <span className="text-end">
                      <Money agorot={p.amountAgorot} className="block font-semibold" />
                      {p.status !== "confirmed" ? <Badge tone="red">{STATUS_LABEL[p.status]}</Badge> : p.refunds.length > 0 ? <Badge tone="red">הוחזר חלק</Badge> : null}
                    </span>
                  </Link>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-slate-100 md:block">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th>תאריך</th><th>מתפלל</th><th>סכום</th><th>אמצעי</th><th>מצב</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.id}>
                      <td className="text-slate-500">{fmtDate(p.receivedAt)}</td>
                      <td><Link className="font-medium text-brand-700 hover:underline" href={`/congregants/${p.congregantId}`}>{p.congregant.firstName} {p.congregant.lastName}</Link></td>
                      <td className="font-semibold"><Money agorot={p.amountAgorot} />{p.refunds.length > 0 && <> <Badge tone="red">הוחזר חלק</Badge></>}</td>
                      <td>{METHOD_LABEL[p.method]}</td>
                      <td><Badge tone={p.status === "confirmed" ? "green" : "red"} dot>{STATUS_LABEL[p.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="mt-3 text-xs text-slate-500">החזר כספי מבוצע בממשק ספק הסליקה. המערכת קולטת אותו לאחר אימות מול הספק ומעדכנת את היתרה.</p>
      </Card>
    </>
  );
}
