import Link from "next/link";
import { Building2, ChevronLeft, PlusCircle, Search } from "lucide-react";
import { requireAdmin } from "@/server/auth/session";
import { tenantSummaries } from "@/server/admin/dashboard";
import { Badge, Empty, LinkButton, PageHeader, cx, fmtDate } from "@/components/ui";
import { SUB_LABEL, subTone } from "@/components/admin/labels";

const FILTERS = [
  ["all", "כולם"],
  ["active", "פעילים"],
  ["trial", "ניסיון"],
  ["attention", "דורשים טיפול"],
  ["inactive", "מושעים / מבוטלים"],
] as const;

export default async function AdminTenants({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const a = await requireAdmin();
  const { q = "", f = "all" } = await searchParams;
  const all = await tenantSummaries(a.userId);
  const words = q.trim().toLowerCase();
  const rows = all.filter((t) => {
    const s = t.subscription?.status;
    const matchF =
      f === "active" ? s === "active" : f === "trial" ? s === "trial" : f === "inactive" ? s === "suspended" || s === "cancelled" : f === "attention" ? t.needsAttention || t.integrationError || ["past_due", "grace"].includes(s ?? "") : true;
    const matchQ = !words || `${t.name} ${t.city ?? ""} ${t.gabbai?.email ?? ""}`.toLowerCase().includes(words);
    return matchF && matchQ;
  });
  const qs = (nf: string) => `/admin/tenants?${new URLSearchParams({ ...(q ? { q } : {}), ...(nf !== "all" ? { f: nf } : {}) })}`;
  return (
    <>
      <PageHeader
        title="בתי כנסת"
        icon={Building2}
        subtitle={<><span className="num">{all.length}</span> בתי כנסת בשירות</>}
        actions={
          <LinkButton href="/admin/onboard" size="sm">
            <PlusCircle className="size-4" aria-hidden /> בית כנסת חדש
          </LinkButton>
        }
      />
      <div className="space-y-3">
        <form role="search" className="relative">
          <label className="sr-only" htmlFor="q">חיפוש</label>
          <Search className="pointer-events-none absolute top-1/2 start-3.5 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input id="q" name="q" defaultValue={q} type="search" placeholder="חיפוש לפי שם, עיר או דוא״ל הגבאי"
            className="block min-h-12 w-full rounded-2xl border border-slate-200 bg-white ps-11 pe-24 text-base shadow-card placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
          {f !== "all" && <input type="hidden" name="f" value={f} />}
          <button className="absolute top-1/2 end-1.5 -translate-y-1/2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">חיפוש</button>
        </form>
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="סינון">
          {FILTERS.map(([k, label]) => (
            <Link key={k} href={qs(k)} aria-current={f === k ? "page" : undefined}
              className={cx("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition", f === k ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? (
        <Empty icon={Building2}>{all.length === 0 ? "עדיין אין בתי כנסת." : "לא נמצאו בתי כנסת מתאימים."}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/tenants/${t.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Building2 className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {t.city ? `${t.city} · ` : ""}גבאי: <span dir="ltr">{t.gabbai?.email ?? "—"}</span> · הצטרף {fmtDate(t.createdAt)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge><span className="num">{t.congregants}</span> מתפללים</Badge>
                    <Badge><span className="num">{t.payments}</span> תשלומים</Badge>
                    {!t.gabbaiSignedIn && <Badge tone="amber">הגבאי עוד לא נכנס</Badge>}
                    {t.integrationError && <Badge tone="red">תקלה בחיבור</Badge>}
                    {t.needsAttention && <Badge tone="amber">דורש תשומת לב</Badge>}
                  </div>
                </div>
                <Badge tone={subTone(t.subscription?.status)} dot>{SUB_LABEL[t.subscription?.status ?? ""] ?? "ללא מנוי"}</Badge>
                <ChevronLeft className="size-5 shrink-0 text-slate-300" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
