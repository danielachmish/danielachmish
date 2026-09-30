import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Small shadcn-style primitives on Tailwind. RTL-first; amounts are wrapped in .num (LTR isolate).

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        variant === "ghost" && "text-brand-700 hover:bg-brand-50",
        className,
      )}
    />
  );
}

export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" }) {
  return (
    <Link
      {...p}
      className={cx(
        "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-base font-medium",
        variant === "primary" ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-slate-300 bg-white hover:bg-slate-100",
        className,
      )}
    />
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      {error && <span className="block text-sm text-red-700">{error}</span>}
    </label>
  );
}

export const inputClass =
  "block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base placeholder:text-slate-400 focus:border-brand-600";

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={cx(inputClass, p.className)} />;
}
export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={cx(inputClass, p.className)} />;
}
export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx(inputClass, "min-h-20 py-2", p.className)} />;
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = "slate", children }: { tone?: "slate" | "green" | "amber" | "red" | "blue"; children: ReactNode }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-red-100 text-red-800",
    blue: "bg-brand-100 text-brand-900",
  };
  return <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Money({ agorot, className }: { agorot: number; className?: string }) {
  const sign = agorot < 0 ? "-" : "";
  const a = Math.abs(agorot);
  const whole = Math.floor(a / 100).toLocaleString("en-US");
  const frac = a % 100;
  return <span className={cx("num", className)}>{`${sign}₪${whole}${frac ? "." + String(frac).padStart(2, "0") : ""}`}</span>;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const t = {
    info: "border-brand-100 bg-brand-50 text-brand-900",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-green-200 bg-green-50 text-green-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-lg border p-3 text-sm", t)}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">{children}</p>;
}

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : "";
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d))
    : "";

export const METHOD_LABEL: Record<string, string> = { card: "אשראי", cash: "מזומן", transfer: "העברה", check: "צ'ק" };
export const STATUS_LABEL: Record<string, string> = { confirmed: "מאושר", pending_approval: "ממתין לאישור", rejected: "נדחה" };
