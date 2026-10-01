import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { byCategory, cardSummaries, debtAging, monthlyReport } from "@/server/ledger/aggregate";
import { BarChart3, Download, Hourglass, PieChart, TrendingUp, Trophy, Wallet } from "lucide-react";
import { Avatar, Card, Empty, LinkButton, Money, PageHeader, Stat } from "@/components/ui";

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
  const year = r.months.reduce((a, m) => ({ pledged: a.pledged + m.pledgedAgorot, collected: a.collected + m.collectedAgorot }), { pledged: 0, collected: 0 });
  const maxMonth = Math.max(1, ...r.months.map((m) => Math.max(m.pledgedAgorot, m.collectedAgorot)));
  const months = [...r.months].reverse(); // oldest → newest, read right-to-left
  const AGE_TONE: Record<string, string> = { "0-30": "bg-brand-400", "31-90": "bg-gold-400", "91-180": "bg-orange-500", "181+": "bg-red-600" };
  return (
    <>
      <PageHeader
        title="דוחות"
        icon={PieChart}
        subtitle="גבייה, גיל חובות ובעלי החוב – מחושב תמיד מהתנועות עצמן."
        actions={
          <LinkButton href="/api/export/reports" variant="secondary" size="sm" prefetch={false}>
            <Download className="size-4" aria-hidden /> ייצוא (CSV)
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="נגבה ב-12 חודשים" value={<Money agorot={year.collected} />} icon={TrendingUp} tone="green" />
        <Stat label="נדרים חדשים ב-12 חודשים" value={<Money agorot={year.pledged} />} icon={Wallet} tone="brand" />
        <Stat label="חוב פתוח כעת" value={<Money agorot={totalOpen} />} icon={Hourglass} tone="red" />
      </div>

      <Card title="גבייה לפי חודשים" icon={BarChart3} description="12 החודשים האחרונים">
        <div className="mb-3 flex gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-200" aria-hidden />נדרים חדשים</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500" aria-hidden />נגבה</span>
        </div>
        <div className="flex h-44 items-end gap-1.5 overflow-x-auto border-b border-slate-200 pb-0.5 sm:gap-3" role="img" aria-label="תרשים גבייה חודשית">
          {months.map((m) => (
            <div key={m.month} className="flex min-w-7 flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-36 w-full items-end justify-center gap-0.5">
                <div className="w-1/2 max-w-4 rounded-t bg-brand-200" style={{ height: `${(m.pledgedAgorot / maxMonth) * 100}%` }} title={`נדרים ${m.pledgedAgorot / 100}`} />
                <div className="w-1/2 max-w-4 rounded-t bg-emerald-500" style={{ height: `${(m.collectedAgorot / maxMonth) * 100}%` }} title={`נגבה ${m.collectedAgorot / 100}`} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5 overflow-hidden text-[10px] text-slate-500 sm:gap-3">
          {months.map((m) => (
            <span key={m.month} className="min-w-7 flex-1 truncate text-center">{MONTHS[Number(m.month.slice(5, 7)) - 1]!.slice(0, 3)}</span>
          ))}
        </div>
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100">
          <table className="table-clean">
            <thead>
              <tr><th>חודש</th><th>נדרים חדשים</th><th>נגבה</th><th>החזרים</th><th>תשלומים</th></tr>
            </thead>
            <tbody>
              {r.months.map((m) => (
                <tr key={m.month}>
                  <td>{monthName(m.month)}</td>
                  <td><Money agorot={m.pledgedAgorot} /></td>
                  <td className="font-semibold text-emerald-700"><Money agorot={m.collectedAgorot} /></td>
                  <td>{m.refundedAgorot ? <Money agorot={-m.refundedAgorot} /> : "—"}</td>
                  <td className="num">{m.payments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">״נגבה״ – תשלומים מאושרים לפי תאריך קבלה. תשלומים שממתינים לאישור אינם נכללים.</p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="גיל החובות הפתוחים" icon={Hourglass}>
          {totalOpen === 0 ? <Empty>אין חובות פתוחים.</Empty> : (
            <>
              <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                {r.aging.map((b) => (
                  <div key={b.bucket} className={AGE_TONE[b.bucket]} style={{ width: `${(b.outstandingAgorot / totalOpen) * 100}%` }} />
                ))}
              </div>
              <ul className="space-y-2.5 text-sm">
                {r.aging.map((b) => (
                  <li key={b.bucket} className="flex items-center gap-2.5">
                    <span className={`size-2.5 rounded-full ${AGE_TONE[b.bucket]}`} aria-hidden />
                    <span className="flex-1">{AGE[b.bucket]} <span className="text-slate-500">({b.pledges} נדרים)</span></span>
                    <Money agorot={b.outstandingAgorot} className="font-semibold" />
                    <span className="num w-10 text-end text-xs text-slate-400">{Math.round((b.outstandingAgorot / totalOpen) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card title="בעלי החוב הגבוה ביותר" icon={Trophy}>
          {r.top.length === 0 ? <Empty>אין חובות פתוחים.</Empty> : (
            <ol className="-mx-2 divide-y divide-slate-100 text-sm">
              {r.top.map((p, i) => (
                <li key={p.id}>
                  <Link className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50" href={`/congregants/${p.id}`}>
                    <span className="num w-5 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                    <Avatar name={`${p.firstName} ${p.lastName}`} size="sm" />
                    <span className="flex-1 font-medium">{p.firstName} {p.lastName}</span>
                    <Money agorot={p.debt} className="font-semibold text-red-700" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="לפי סוג נדר" icon={PieChart}>
        {r.cats.length === 0 ? <Empty>אין נדרים.</Empty> : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="table-clean">
              <thead><tr><th>סוג</th><th>נדרים</th><th>סה״כ</th><th>שולם</th><th>פתוח</th><th className="w-32">אחוז גבייה</th></tr></thead>
              <tbody>
                {r.cats.map((c) => {
                  const pct = c.pledgedAgorot ? Math.round((c.paidAgorot / c.pledgedAgorot) * 100) : 0;
                  return (
                    <tr key={c.category}>
                      <td className="font-medium">{c.category}</td><td className="num">{c.pledges}</td>
                      <td><Money agorot={c.pledgedAgorot} /></td><td><Money agorot={c.paidAgorot} /></td>
                      <td className="font-semibold text-red-700"><Money agorot={c.openAgorot} /></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                          <span className="num w-9 text-xs text-slate-500">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
