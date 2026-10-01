import Link from "next/link";
import { BrandMark } from "./brand";

/** Shell for the legal pages: readable column, plain typography. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/login" className="mb-8 inline-flex items-center gap-2.5">
        <BrandMark className="size-9" />
        <span className="font-bold">נדרים</span>
      </Link>
      <article className="rounded-3xl border border-slate-200/80 bg-white p-6 leading-relaxed shadow-card sm:p-10 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:ps-6 text-slate-700">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="!mt-1 text-sm text-slate-500">עדכון אחרון: {updated}</p>
        {children}
      </article>
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link className="hover:underline" href="/terms">תנאי שימוש</Link> · <Link className="hover:underline" href="/privacy">מדיניות פרטיות</Link>
      </p>
    </main>
  );
}

export function supportContact() {
  const e = process.env.SUPPORT_EMAIL;
  return e ? <a className="text-brand-700 underline" href={`mailto:${e}`} dir="ltr">{e}</a> : <>מנהל השירות</>;
}
