import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { byCategory, cardSummaries, debtAging, monthlyReport } from "@/server/ledger/aggregate";
import { Card, Empty, LinkButton, Money } from "@/components/ui";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const AGE: Record<string, string> = { "0-30": "עד חודש", "31-90": "1–3 חודשים", "91-180": "3–6 חודשים", "181+": "מעל חצי שנה" };

export default async function Reports() {
  const g = await requireGabbai();
  const r = await withContext(g.ctx, async (tx) => {
    const sums = await cardSummaries(tx);
    const people = await tx.congregant.findMany({ select: { id: true, firstName: true, lastName: true } });
    const top = people
      .map((p) => ({ ...p, debt: sums.get(p.id)?.debtAgorot ?? 0 }))
      .filter((p) => p.debt > 0)
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 10);
    return { months: await monthlyReport(tx, 12), aging: await debtAging(tx), cats: await byCategory(tx), top };
  });
  const totalOpen = r.aging.reduce((s, b) => s + b.outstandingAgorot, 0);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">דוחות</h1>
        <LinkButton href="/api/export/reports" variant="secondary" prefetch={false}>ייצוא דוחות (CSV)</LinkButton>
      </div>

      <Card title="גבייה לפי חודשים (12 חודשים אחרונים)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr className="text-right"><th className="p-2">חודש</th><th className="p-2">נדרים חדשים</th><th className="p-2">נגבה</th><th className="p-2">החזרים</th><th className="p-2">תשלומים</th></tr>
            </thead>
            <tbody>
              {r.months.map((m) => (
                <tr key={m.month} className="border-t border-slate-100">
                  <td className="p-2">{monthName(m.month)}</td>
                  <td className="p-2"><Money agorot={m.pledgedAgorot} /></td>
                  <td className="p-2 font-medium"><Money agorot={m.collectedAgorot} /></td>
                  <td className="p-2">{m.refundedAgorot ? <Money agorot={-m.refundedAgorot} /> : "—"}</td>
                  <td className="p-2 num">{m.payments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">״נגבה״ – תשלומים מאושרים לפי תאריך קבלה. תשלומים שממתינים לאישור אינם נכללים.</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="גיל החובות הפתוחים">
          {totalOpen === 0 ? <Empty>אין חובות פתוחים.</Empty> : (
            <ul className="space-y-2 text-sm">
              {r.aging.map((b) => (
                <li key={b.bucket}>
                  <div className="flex justify-between"><span>{AGE[b.bucket]} <span className="text-slate-500">({b.pledges} נדרים)</span></span><Money agorot={b.outstandingAgorot} className="font-medium" /></div>
                  <div className="mt-1 h-2 rounded bg-slate-100" aria-hidden><div className="h-2 rounded bg-brand-600" style={{ width: `${Math.round((b.outstandingAgorot / totalOpen) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="בעלי החוב הגבוה ביותר">
          {r.top.length === 0 ? <Empty>אין חובות פתוחים.</Empty> : (
            <ol className="divide-y divide-slate-100 text-sm">
              {r.top.map((p) => (
                <li key={p.id} className="flex justify-between py-1.5">
                  <Link className="text-brand-700 hover:underline" href={`/congregants/${p.id}`}>{p.firstName} {p.lastName}</Link>
                  <Money agorot={p.debt} />
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="לפי סוג נדר">
        {r.cats.length === 0 ? <Empty>אין נדרים.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500"><tr className="text-right"><th className="p-2">סוג</th><th className="p-2">נדרים</th><th className="p-2">סה״כ</th><th className="p-2">שולם</th><th className="p-2">פתוח</th></tr></thead>
              <tbody>
                {r.cats.map((c) => (
                  <tr key={c.category} className="border-t border-slate-100">
                    <td className="p-2">{c.category}</td><td className="p-2 num">{c.pledges}</td>
                    <td className="p-2"><Money agorot={c.pledgedAgorot} /></td><td className="p-2"><Money agorot={c.paidAgorot} /></td>
                    <td className="p-2 font-medium"><Money agorot={c.openAgorot} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
