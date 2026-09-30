import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { Badge, Card, Empty, METHOD_LABEL, Money, STATUS_LABEL, fmtDate } from "@/components/ui";
import { PaymentDecision } from "@/components/gabbai/decisions";

export default async function Payments() {
  const g = await requireGabbai();
  const { pending, recent } = await withContext(g.ctx, async (tx) => ({
    pending: await tx.payment.findMany({ where: { status: "pending_approval" }, include: { congregant: true }, orderBy: { createdAt: "asc" } }),
    recent: await tx.payment.findMany({ where: { status: { not: "pending_approval" } }, include: { congregant: true, refunds: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  }));
  return (
    <>
      <h1 className="text-2xl font-bold">תשלומים</h1>
      <Card title={`ממתינים לאישור (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty>אין דיווחים שממתינים לאישור.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((p) => (
              <li key={p.id} className="space-y-2 py-3">
                <p>
                  <Link href={`/congregants/${p.congregantId}`} className="font-medium text-brand-700 hover:underline">{p.congregant.firstName} {p.congregant.lastName}</Link>{" "}
                  · <Money agorot={p.amountAgorot} /> · {METHOD_LABEL[p.method]} {p.reference && <>· אסמכתה <span className="num">{p.reference}</span></>} · דווח {fmtDate(p.createdAt)} ע״י {p.reportedBy === "congregant" ? "המתפלל" : "הגבאי"}
                </p>
                <PaymentDecision paymentId={p.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="תשלומים אחרונים">
        {recent.length === 0 ? (
          <Empty>אין תשלומים עדיין.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500">
                <tr className="text-right">
                  <th className="p-2">תאריך</th><th className="p-2">מתפלל</th><th className="p-2">סכום</th><th className="p-2">אמצעי</th><th className="p-2">מצב</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="p-2">{fmtDate(p.receivedAt)}</td>
                    <td className="p-2"><Link className="text-brand-700 hover:underline" href={`/congregants/${p.congregantId}`}>{p.congregant.firstName} {p.congregant.lastName}</Link></td>
                    <td className="p-2"><Money agorot={p.amountAgorot} />{p.refunds.length > 0 && <> <Badge tone="red">הוחזר חלק</Badge></>}</td>
                    <td className="p-2">{METHOD_LABEL[p.method]}</td>
                    <td className="p-2"><Badge tone={p.status === "confirmed" ? "green" : "red"}>{STATUS_LABEL[p.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">החזר כספי מבוצע בממשק ספק הסליקה. המערכת קולטת אותו לאחר אימות מול הספק ומעדכנת את היתרה.</p>
      </Card>
    </>
  );
}
