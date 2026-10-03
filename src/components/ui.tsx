import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Inbox, XCircle, type LucideIcon } from "lucide-react";

// Design-system primitives on Tailwind. RTL-first; amounts are wrapped in .num (LTR isolate).

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost" | "gold" | "whatsapp";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "bg-brand-700 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-800 active:bg-brand-900",
  secondary: "border border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  ghost: "text-brand-700 hover:bg-brand-50",
  gold: "bg-gold-400 text-slate-900 shadow-sm hover:bg-gold-300",
  whatsapp: "bg-[#1f8f4e] text-white shadow-sm hover:bg-[#187540]",
};
const sizeClass: Record<Size, string> = {
  sm: "min-h-9 rounded-lg px-3 text-sm",
  md: "min-h-11 rounded-xl px-4 text-base",
  lg: "min-h-13 rounded-xl px-6 text-lg",
};
const base = "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...p} className={cx(base, variantClass[variant], sizeClass[size], className)} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...p} className={cx(base, variantClass[variant], sizeClass[size], className)} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      {error && <span className="block text-sm text-red-700">{error}</span>}
    </label>
  );
}

export const inputClass =
  "block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 shadow-sm shadow-slate-900/[0.02] transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-100";

// A caller-supplied width (w-48, flex-1…) replaces the default full width instead of fighting it.
const sized = (cls?: string) => (cls && /(^|\s)(w-|flex-1)/.test(cls) ? inputClass.replace(" w-full", "") : inputClass);

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={cx(sized(p.className), p.className)} />;
}
export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={cx(sized(p.className), "pe-8", p.className)} />;
}
export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx(sized(p.className), "min-h-24 py-2.5", p.className)} />;
}

export function Card({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  tone = "plain",
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "plain" | "warn" | "brand";
}) {
  return (
    <section
      className={cx(
        "rounded-2xl border p-5 shadow-card",
        tone === "plain" && "border-slate-200/80 bg-white",
        tone === "warn" && "border-gold-200 bg-gold-50",
        tone === "brand" && "border-brand-100 bg-brand-50/60",
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Icon className="size-5" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-lg font-semibold leading-tight text-slate-900">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Collapsible card for secondary forms: keeps long screens calm, one tap to open. */
export function Disclosure({ title, icon: Icon, description, children, open }: { title: string; icon?: LucideIcon; description?: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <summary className="flex items-center gap-3 p-5">
        {Icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold leading-tight">{title}</span>
          {description && <span className="mt-0.5 block text-sm text-slate-500">{description}</span>}
        </span>
        <svg className="chevron size-5 shrink-0 text-slate-400 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </summary>
      <div className="border-t border-slate-100 p-5">{children}</div>
    </details>
  );
}

export function PageHeader({ title, subtitle, icon: Icon, actions, back }: { title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="space-y-3">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="hidden size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 text-gold-300 shadow-sm sm:grid">
              <Icon className="size-5.5" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight text-slate-900 sm:text-[1.7rem]">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const statTones = {
  brand: "bg-brand-50 text-brand-700",
  red: "bg-red-50 text-red-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-gold-100 text-gold-700",
  slate: "bg-slate-100 text-slate-600",
};

export function Stat({ label, value, icon: Icon, tone = "brand", hint, href }: { label: string; value: ReactNode; icon?: LucideIcon; tone?: keyof typeof statTones; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={cx("grid size-8 place-items-center rounded-lg", statTones[tone])}>
            <Icon className="size-4.5" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900 sm:text-[1.65rem]">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const cls = "block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card";
  return href ? (
    <Link href={href} className={cx(cls, "transition hover:border-brand-200 hover:shadow-raised")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Badge({ tone = "slate", children, dot }: { tone?: "slate" | "green" | "amber" | "red" | "blue" | "gold"; children: ReactNode; dot?: boolean }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    red: "bg-red-50 text-red-800 ring-red-200",
    blue: "bg-brand-50 text-brand-800 ring-brand-200",
    gold: "bg-gold-100 text-gold-700 ring-gold-200",
  };
  const dots = { slate: "bg-slate-400", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", blue: "bg-brand-500", gold: "bg-gold-500" };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone])}>
      {dot && <span className={cx("size-1.5 rounded-full", dots[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function Money({ agorot, className }: { agorot: number; className?: string }) {
  const sign = agorot < 0 ? "-" : "";
  const a = Math.abs(agorot);
  const whole = Math.floor(a / 100).toLocaleString("en-US");
  const frac = a % 100;
  return <span className={cx("num", className)}>{`${sign}₪${whole}${frac ? "." + String(frac).padStart(2, "0") : ""}`}</span>;
}

const alertIcon = { info: Info, error: XCircle, success: CheckCircle2, warn: AlertTriangle };

export function Alert({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const t = {
    info: "border-brand-100 bg-brand-50 text-brand-900",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-gold-200 bg-gold-50 text-gold-700",
  }[tone];
  const Icon = alertIcon[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex items-start gap-2.5 rounded-xl border p-3 text-sm leading-relaxed", t)}>
      <Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Empty({ children, icon: Icon = Inbox }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-8 text-center text-sm text-slate-500">
      <Icon className="size-7 text-slate-300" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/** Initials avatar – a calm, consistent marker for people in lists. */
export function Avatar({ name, size = "md", tone }: { name: string; size?: "sm" | "md" | "lg"; tone?: number }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).trim() || "?";
  const palette = ["bg-brand-100 text-brand-800", "bg-gold-100 text-gold-700", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-800", "bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800"];
  const h = tone ?? [...name].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const sz = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" }[size];
  return <span className={cx("grid shrink-0 place-items-center rounded-full font-semibold", sz, palette[h % palette.length])} aria-hidden>{initials}</span>;
}

export function Divider() {
  return <hr className="my-4 border-slate-100" />;
}

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : "";
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d))
    : "";

export const METHOD_LABEL: Record<string, string> = { card: "אשראי", cash: "מזומן", transfer: "העברה", check: "צ'ק" };
export const STATUS_LABEL: Record<string, string> = { confirmed: "מאושר", pending_approval: "ממתין לאישור", rejected: "נדחה" };

/** Link tabs for sub-pages (works in server components; the active tab is passed in). */
export function Tabs({ items, active }: { items: { href: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="לשוניות" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 rounded-2xl border border-slate-200/80 bg-white p-1 shadow-card">
        {items.map((t) => {
          const on = t.href === active;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition",
                  on ? "bg-brand-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {t.label}
                {t.count ? <span className={cx("num rounded-full px-1.5 text-xs font-bold", on ? "bg-white/20" : "bg-gold-100 text-gold-700")}>{t.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Single-series column chart (one hue, rounded data-ends, recessive baseline). Each column has a hover
 * tooltip and an accessible label; the values are also available as a table via `tableLabel`.
 */
export function ColumnChart({ data, label, unit = "", tone = "brand" }: { data: { key: string; label: string; value: number }[]; label: string; unit?: string; tone?: "brand" | "green" | "gold" }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const bar = { brand: "bg-brand-500", green: "bg-emerald-500", gold: "bg-gold-400" }[tone];
  return (
    <figure>
      <div className="flex h-36 items-end gap-1 border-b border-slate-200 sm:gap-2" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}${unit}`).join(", ")}`}>
        {data.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end justify-center">
            <div className={cx("w-full max-w-7 rounded-t-[4px] transition-opacity group-hover:opacity-80", bar, d.value === 0 && "opacity-20")} style={{ height: `${Math.max(d.value ? 4 : 2, (d.value / max) * 100)}%` }} />
            <span className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block">
              {d.label}: <span className="num">{d.value.toLocaleString("en-US")}{unit}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-slate-500 sm:gap-2">
        {data.map((d) => (
          <span key={d.key} className="flex-1 truncate text-center">{d.label}</span>
        ))}
      </div>
    </figure>
  );
}
