import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { SignOutButton } from "@/components/sign-out";

const NAV = [
  ["/dashboard", "לוח בקרה"],
  ["/congregants", "מתפללים"],
  ["/pledges/batch", "קליטת נדרים"],
  ["/payments", "תשלומים"],
  ["/tasks", "משימות"],
  ["/reminders", "תזכורות"],
  ["/reports", "דוחות"],
  ["/settings", "הגדרות"],
  ["/activity", "יומן"],
] as const;

export default async function GabbaiLayout({ children }: { children: React.ReactNode }) {
  const g = await requireGabbai();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{g.tenantName}</p>
            <p className="truncate text-xs text-slate-500">{g.name}</p>
          </div>
          <SignOutButton />
        </div>
        <nav aria-label="ניווט ראשי" className="mx-auto max-w-6xl overflow-x-auto px-2">
          <ul className="flex gap-1 whitespace-nowrap pb-2">
            {NAV.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">{children}</main>
    </div>
  );
}
