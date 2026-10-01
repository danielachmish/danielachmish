import { cx } from "./ui";

/** App mark: gold Star of David on a deep-blue tile (same as the home-screen icon). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-950 shadow-sm", className ?? "size-10")} aria-hidden>
      <svg viewBox="0 0 512 512" className="size-[62%]">
        <path d="M256 112 L380 328 H132 Z M256 400 L132 184 H380 Z" fill="none" stroke="#e7c46c" strokeWidth="30" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function BrandName({ light }: { light?: boolean }) {
  return (
    <span className="leading-tight">
      <span className={cx("block text-lg font-bold", light ? "text-white" : "text-slate-900")}>נדרים</span>
      <span className={cx("block text-xs", light ? "text-brand-200" : "text-slate-500")}>ניהול נדרים ותשלומים</span>
    </span>
  );
}

/** Centered shell for sign-in / invitation / personal-link pages. */
export function AuthShell({ title, subtitle, children, footer }: { title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-900 via-brand-800 to-brand-700" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-72 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:22px_22px]" aria-hidden />
      <main className="relative mx-auto flex max-w-md flex-col px-4 pb-10 pt-10 sm:pt-16">
        <div className="mb-6 flex items-center justify-center gap-3">
          <BrandMark className="size-12" />
          <BrandName light />
        </div>
        <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-raised sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
          <div className="mt-6 space-y-4">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-slate-600">{footer}</div>}
        <p className="mt-6 text-center text-xs text-slate-500">
          <a className="hover:underline" href="/terms">תנאי שימוש</a> · <a className="hover:underline" href="/privacy">מדיניות פרטיות</a>
        </p>
      </main>
    </div>
  );
}
