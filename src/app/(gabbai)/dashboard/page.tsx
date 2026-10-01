import Link from "next/link";
import { HDate } from "@hebcal/core";
import { AlertCircle, ArrowLeft, Banknote, Bell, Clock, CreditCard, HandCoins, ListChecks, NotebookPen, PiggyBank, UserPlus, Users } from "lucide-react";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { cardSummaries } from "@/server/ledger/aggregate";
import { Alert, Avatar, Card, Empty, METHOD_LABEL, Money, Stat, fmtDate } from "@/components/ui";
import { TASK_LABEL } from "@/components/labels";

export default async function Dashboard() {
  const g = await requireGabbai();
  const data = await withContext(g.ctx, async (tx) => {
    const cards = [...(await cardSummaries(tx)).values()];
    let debt = 0;
    let credit = 0;
    let pending = 0;
    let debtors = 0;
    for (const s of cards) {
      debt += s.debtAgorot;
      credit += s.creditAgorot;
      pending += s.pendingExternalAgorot;
      if (s.debtAgorot > 0) debtors++;
    }
    const tasks = await tx.task.groupBy({ by: ["kind"], where: { status: "open" }, _count: true });
    const recent = await tx.payment.findMany({
      where: { status: "confirmed" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { congregant: { select: { firstName: true, lastName: true, id: true } } },
    });
    const integrations = await tx.integrationAccount.findMany({ where: { status: { in: ["active", "error"] } } });
    const sub = await tx.saaSSubscription.findUnique({ where: { tenantId: g.tenantId } });
    return { debt, credit, pending, debtors, count: cards.length, tasks, recent, integrations, sub };
  });
  const openTasks = data.tasks.reduce((s, t) => s + t._count, 0);
  const hasPayment = data.integrations.some((i) => i.kind === "payment");
  const hasMessaging = data.integrations.some((i) => i.kind === "messaging");
  const today = new Date();
  const hebrew = new HDate(today).renderGematriya(true);
  const gregorian = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long" }).format(today);

  return (
    <>
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 p-6 text-white shadow-raised sm:p-8">
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:20px_20px]" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-brand-200">
              {gregorian} · <span className="text-gold-300">{hebrew}</span>
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">שלום, {g.name.split(" ")[0]}</h1>
            <p className="mt-1 text-brand-200">{g.tenantName}</p>
          </div>
          <div className="text-start sm:text-end">
            <p className="text-sm text-brand-200">סך החוב הפתוח</p>
            <Money agorot={data.debt} className="text-3xl font-bold text-white sm:text-4xl" />
            <p className="mt-0.5 text-sm text-brand-200">
              <span className="num">{data.debtors}</span> מתוך <span className="num">{data.count}</span> מתפללים
            </p>
          </div>
        </div>
      </div>

      {(!hasPayment || !hasMessaging || (data.sub && ["suspended", "cancelled"].includes(data.sub.status))) && (
        <div className="space-y-2">
          {!hasPayment && <Alert tone="warn">הסליקה עדיין לא חוברה. מתפללים לא יוכלו לשלם באשראי עד שתחברו חשבון ב<Link className="font-medium underline" href="/settings">הגדרות</Link>.</Alert>}
          {!hasMessaging && <Alert tone="warn">חשבון הוואטסאפ לא חובר – תזכורות אוטומטיות לא יישלחו. אפשר לשלוח מהוואטסאפ שלך מכרטיס המתפלל.</Alert>}
          {data.sub && ["suspended", "cancelled"].includes(data.sub.status) && (
            <Alert tone="error">המנוי אינו פעיל. תשלומים ותזכורות חדשים מושהים; תשלומים שכבר התחילו ימשיכו להיקלט.</Alert>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="חוב פתוח" value={<Money agorot={data.debt} />} icon={Banknote} tone="red" href="/reports" />
        <Stat label="מתפללים עם חוב" value={<span className="num">{data.debtors}</span>} hint={<>מתוך <span className="num">{data.count}</span></>} icon={Users} tone="brand" href="/congregants" />
        <Stat label="ממתין לאישור" value={<Money agorot={data.pending} />} icon={Clock} tone="amber" href="/payments" />
        <Stat label="יתרות זכות" value={<Money agorot={data.credit} />} icon={PiggyBank} tone="green" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href="/pledges/batch" icon={NotebookPen} label="קליטת נדרים" hint="אחרי שבת" primary />
        <QuickAction href="/congregants/new" icon={UserPlus} label="מתפלל חדש" />
        <QuickAction href="/reminders" icon={Bell} label="שליחת תזכורות" />
        <QuickAction href="/payments" icon={HandCoins} label="אישור תשלומים" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card
          className="lg:col-span-2"
          title="משימות פתוחות"
          icon={ListChecks}
          actions={
            <Link href="/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              לכל המשימות <ArrowLeft className="size-4" aria-hidden />
            </Link>
          }
        >
          {openTasks === 0 ? (
            <Empty icon={ListChecks}>אין משימות פתוחות. הכול מטופל.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.tasks.map((t) => (
                <li key={t.kind}>
                  <Link href="/tasks" className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 transition hover:border-gold-300 hover:bg-gold-50">
                    <AlertCircle className="size-5 text-gold-600" aria-hidden />
                    <span className="flex-1 font-medium">{TASK_LABEL[t.kind] ?? t.kind}</span>
                    <span className="num rounded-full bg-gold-100 px-2.5 py-0.5 text-sm font-bold text-gold-700">{t._count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          className="lg:col-span-3"
          title="תשלומים אחרונים"
          icon={CreditCard}
          actions={
            <Link href="/payments" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              לכל התשלומים <ArrowLeft className="size-4" aria-hidden />
            </Link>
          }
        >
          {data.recent.length === 0 ? (
            <Empty icon={CreditCard}>עדיין לא התקבלו תשלומים.</Empty>
          ) : (
            <ul className="-mx-2 divide-y divide-slate-100">
              {data.recent.map((p) => (
                <li key={p.id}>
                  <Link href={`/congregants/${p.congregant.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50">
                    <Avatar name={`${p.congregant.firstName} ${p.congregant.lastName}`} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {p.congregant.firstName} {p.congregant.lastName}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {METHOD_LABEL[p.method]} · {fmtDate(p.receivedAt)}
                      </span>
                    </span>
                    <Money agorot={p.amountAgorot} className="font-semibold text-emerald-700" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function QuickAction({ href, icon: Icon, label, hint, primary }: { href: string; icon: typeof Bell; label: string; hint?: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "group flex items-center gap-3 rounded-2xl bg-gold-400 p-4 font-semibold text-slate-900 shadow-card transition hover:bg-gold-300"
          : "group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 font-semibold shadow-card transition hover:border-brand-200 hover:shadow-raised"
      }
    >
      <span className={primary ? "grid size-10 place-items-center rounded-xl bg-white/50" : "grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 leading-tight">
        {label}
        {hint && <span className="block text-xs font-normal opacity-70">{hint}</span>}
      </span>
    </Link>
  );
}
