"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  CreditCard,
  History,
  LayoutDashboard,
  ListChecks,
  Menu,
  NotebookPen,
  PieChart,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "../brand";
import { cx } from "../ui";

type Item = { href: string; label: string; icon: LucideIcon; badge?: number };

const NAV: Item[] = [
  { href: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/congregants", label: "מתפללים", icon: Users },
  { href: "/pledges/batch", label: "קליטת נדרים", icon: NotebookPen },
  { href: "/payments", label: "תשלומים", icon: CreditCard },
  { href: "/tasks", label: "משימות", icon: ListChecks },
  { href: "/reminders", label: "תזכורות", icon: Bell },
  { href: "/reports", label: "דוחות", icon: PieChart },
  { href: "/activity", label: "יומן פעולות", icon: History },
  { href: "/settings", label: "הגדרות", icon: Settings },
];
const ADMIN_NAV: Item[] = [
  { href: "/admin", label: "סקירת השירות", icon: ShieldCheck },
  { href: "/admin/defaults", label: "הגדרות מערכת", icon: SlidersHorizontal },
];
// Mobile bottom bar: the four daily screens + "more".
const PRIMARY = ["/dashboard", "/congregants", "/pledges/batch", "/payments", "/admin", "/admin/defaults"];

const isActive = (path: string, href: string) =>
  path === href || (href !== "/dashboard" && href !== "/admin" && path.startsWith(href + "/")) || (href === "/admin" && path.startsWith("/admin/tenants"));

export function GabbaiShell({
  tenantName,
  userName,
  openTasks = 0,
  footer,
  children,
  variant = "gabbai",
}: {
  tenantName: string;
  userName: string;
  openTasks?: number;
  footer: React.ReactNode;
  children: React.ReactNode;
  variant?: "gabbai" | "admin";
}) {
  const path = usePathname();
  // The "more" sheet belongs to the page it was opened on: navigating closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const more = openAt === path;
  const setMore = (v: boolean) => setOpenAt(v ? path : null);
  const items = (variant === "admin" ? ADMIN_NAV : NAV).map((i) => (i.href === "/tasks" && openTasks > 0 ? { ...i, badge: openTasks } : i));
  const primary = items.filter((i) => PRIMARY.includes(i.href));

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar (start side = right in RTL) */}
      <aside className="hidden w-68 shrink-0 flex-col bg-brand-950 text-brand-100 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <BrandMark className="size-10" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{tenantName}</p>
            <p className="truncate text-xs text-brand-300">{userName}</p>
          </div>
        </div>
        <nav aria-label="ניווט ראשי" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-0.5">
            {items.map((i) => (
              <li key={i.href}>
                <NavLink item={i} active={isActive(path, i.href)} dark />
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-white/10 p-3 [&_a]:text-brand-100 [&_a:hover]:bg-white/10 [&_button]:text-brand-100 [&_button:hover]:bg-white/10">{footer}</div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="size-9" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{tenantName}</p>
              <p className="truncate text-xs text-slate-500">{userName}</p>
            </div>
          </div>
          <button type="button" onClick={() => setMore(true)} className="grid size-10 place-items-center rounded-xl text-slate-700 hover:bg-slate-100" aria-label="תפריט">
            <Menu className="size-5" />
          </button>
        </header>

        <main className="mx-auto max-w-6xl space-y-5 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">{children}</main>

        {/* Mobile bottom navigation */}
        <nav aria-label="ניווט מהיר" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <ul className={cx("grid", primary.length === 4 ? "grid-cols-5" : "grid-cols-3")}>
            {primary
              .map((i) => {
                const active = isActive(path, i.href);
                return (
                  <li key={i.href}>
                    <Link href={i.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-brand-700" : "text-slate-500")}>
                      <span className={cx("grid h-7 w-12 place-items-center rounded-full transition", active && "bg-brand-100")}>
                        <i.icon className="size-5" aria-hidden />
                      </span>
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            <li>
              <button type="button" onClick={() => setMore(true)} className="relative flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500">
                <span className="grid h-7 w-12 place-items-center rounded-full">
                  <Menu className="size-5" aria-hidden />
                </span>
                עוד
                {openTasks > 0 && <span className="absolute top-1.5 start-[calc(50%+8px)] size-2 rounded-full bg-red-500" aria-hidden />}
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {/* Mobile "more" sheet */}
      {more && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="תפריט">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="סגירה" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-raised">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-semibold">תפריט</p>
              <button type="button" onClick={() => setMore(false)} className="grid size-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="סגירה">
                <X className="size-5" />
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    className={cx(
                      "relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center text-sm font-medium",
                      isActive(path, i.href) ? "border-brand-200 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-700",
                    )}
                  >
                    <i.icon className="size-5.5" aria-hidden />
                    {i.label}
                    {i.badge ? <span className="absolute top-2 end-2 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{i.badge}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">{footer}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({ item, active, dark }: { item: Item; active: boolean; dark?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition",
        dark && (active ? "bg-white/10 text-white shadow-[inset_-3px_0_0_var(--color-gold-400)]" : "text-brand-200 hover:bg-white/5 hover:text-white"),
      )}
    >
      <item.icon className={cx("size-5", active ? "text-gold-300" : "text-brand-300")} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.badge ? <span className="rounded-full bg-gold-400 px-2 py-0.5 text-xs font-bold text-slate-900">{item.badge}</span> : null}
    </Link>
  );
}
