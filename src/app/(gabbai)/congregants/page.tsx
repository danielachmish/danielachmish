import Link from "next/link";
import { ChevronLeft, FileUp, Search, UserPlus, Users } from "lucide-react";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { listCongregants } from "@/server/gabbai/congregants";
import { displayPhone } from "@/server/util/phone";
import { Avatar, Badge, Empty, LinkButton, Money, PageHeader, cx } from "@/components/ui";

const FILTERS = [
  ["all", "כולם"],
  ["debt", "עם חוב"],
  ["pending", "ממתין לאישור"],
  ["credit", "עם זכות"],
] as const;

export default async function Congregants({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const g = await requireGabbai();
  const { q, f = "all" } = await searchParams;
  const all = await withContext(g.ctx, (tx) => listCongregants(tx, q));
  const rows = all.filter((c) =>
    f === "debt" ? c.summary.debtAgorot > 0 : f === "pending" ? c.summary.pendingExternalAgorot > 0 : f === "credit" ? c.summary.creditAgorot > 0 : true,
  );
  const qs = (nf: string) => `/congregants?${new URLSearchParams({ ...(q ? { q } : {}), ...(nf !== "all" ? { f: nf } : {}) })}`;
  return (
    <>
      <PageHeader
        title="מתפללים"
        subtitle={<><span className="num">{all.length}</span> כרטיסים</>}
        icon={Users}
        actions={
          <>
            <LinkButton href="/congregants/import" variant="secondary" size="sm">
              <FileUp className="size-4" aria-hidden /> ייבוא מתפללים
            </LinkButton>
            <LinkButton href="/pledges/import" variant="secondary" size="sm">
              <FileUp className="size-4" aria-hidden /> ייבוא נדרים
            </LinkButton>
            <LinkButton href="/congregants/new" size="sm">
              <UserPlus className="size-4" aria-hidden /> מתפלל חדש
            </LinkButton>
          </>
        }
      />
      <div className="space-y-3">
        <form role="search" className="relative">
          <label className="sr-only" htmlFor="q">
            חיפוש
          </label>
          <Search className="pointer-events-none absolute top-1/2 start-3.5 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="חיפוש לפי שם או טלפון"
            type="search"
            className="block min-h-12 w-full rounded-2xl border border-slate-200 bg-white ps-11 pe-24 text-base shadow-card placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
          {f !== "all" && <input type="hidden" name="f" value={f} />}
          <button className="absolute top-1/2 end-1.5 -translate-y-1/2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">חיפוש</button>
        </form>
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="סינון">
          {FILTERS.map(([k, label]) => (
            <Link
              key={k}
              href={qs(k)}
              aria-current={f === k ? "page" : undefined}
              className={cx(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                f === k ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? (
        <Empty icon={Users}>{q || f !== "all" ? "לא נמצאו מתפללים מתאימים." : "עדיין אין מתפללים. אפשר להוסיף ידנית או לייבא מקובץ."}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/congregants/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                <Avatar name={`${c.firstName} ${c.lastName}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {c.firstName} {c.lastName}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="num text-sm text-slate-500">{displayPhone(c.phone) || "ללא טלפון"}</span>
                    {c.summary.creditAgorot > 0 && (
                      <Badge tone="green">
                        זכות <Money agorot={c.summary.creditAgorot} />
                      </Badge>
                    )}
                    {c.summary.pendingExternalAgorot > 0 && <Badge tone="amber">ממתין לאישור</Badge>}
                    {c.messagingOptOut && <Badge>הודעות הופסקו</Badge>}
                  </div>
                </div>
                <div className="text-end">
                  {c.summary.debtAgorot > 0 ? (
                    <>
                      <Money agorot={c.summary.debtAgorot} className="block font-semibold text-red-700" />
                      <span className="text-xs text-slate-400">חוב</span>
                    </>
                  ) : (
                    <span className="text-sm text-emerald-700">אין חוב</span>
                  )}
                </div>
                <ChevronLeft className="size-5 shrink-0 text-slate-300" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
