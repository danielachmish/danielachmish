import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { listCongregants } from "@/server/gabbai/congregants";
import { displayPhone } from "@/server/util/phone";
import { Badge, Empty, Input, LinkButton, Money } from "@/components/ui";

export default async function Congregants({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const g = await requireGabbai();
  const { q } = await searchParams;
  const rows = await withContext(g.ctx, (tx) => listCongregants(tx, q));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">מתפללים</h1>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/congregants/import" variant="secondary">
            ייבוא מתפללים
          </LinkButton>
          <LinkButton href="/pledges/import" variant="secondary">
            ייבוא נדרים
          </LinkButton>
          <LinkButton href="/congregants/new">מתפלל חדש</LinkButton>
        </div>
      </div>
      <form role="search" className="flex gap-2">
        <label className="sr-only" htmlFor="q">
          חיפוש
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder="חיפוש לפי שם או טלפון" type="search" />
        <button className="min-h-11 rounded-lg border border-slate-300 bg-white px-4">חיפוש</button>
      </form>
      {rows.length === 0 ? (
        <Empty>{q ? "לא נמצאו מתפללים מתאימים." : "עדיין אין מתפללים. אפשר להוסיף ידנית או לייבא מקובץ."}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/congregants/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {c.lastName} {c.firstName}
                  </p>
                  <p className="num text-right text-sm text-slate-500">{displayPhone(c.phone) || "—"}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {c.summary.debtAgorot > 0 ? (
                    <Money agorot={c.summary.debtAgorot} className="font-semibold text-red-700" />
                  ) : (
                    <span className="text-sm text-slate-400">אין חוב</span>
                  )}
                  <div className="flex gap-1">
                    {c.summary.creditAgorot > 0 && (
                      <Badge tone="green">
                        זכות <Money agorot={c.summary.creditAgorot} />
                      </Badge>
                    )}
                    {c.summary.pendingExternalAgorot > 0 && <Badge tone="amber">ממתין לאישור</Badge>}
                    {c.messagingOptOut && <Badge>הודעות הופסקו</Badge>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
