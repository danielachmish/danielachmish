import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { cardSummaries } from "@/server/ledger/aggregate";
import { Alert, Badge, Card, Empty, LinkButton, METHOD_LABEL, Money, fmtDate } from "@/components/ui";
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
      take: 8,
      include: { congregant: { select: { firstName: true, lastName: true, id: true } } },
    });
    const integrations = await tx.integrationAccount.findMany({ where: { status: { in: ["active", "error"] } } });
    const sub = await tx.saaSSubscription.findUnique({ where: { tenantId: g.tenantId } });
    return { debt, credit, pending, debtors, count: cards.length, tasks, recent, integrations, sub };
  });
  const openTasks = data.tasks.reduce((s, t) => s + t._count, 0);
  const hasPayment = data.integrations.some((i) => i.kind === "payment");
  const hasMessaging = data.integrations.some((i) => i.kind === "messaging");

  return (
    <>
      <h1 className="text-2xl font-bold">לוח בקרה</h1>
      {!hasPayment && <Alert tone="warn">הסליקה עדיין לא חוברה. מתפללים לא יוכלו לשלם באשראי עד שתחברו חשבון בהגדרות.</Alert>}
      {!hasMessaging && <Alert tone="warn">חשבון הוואטסאפ לא חובר – תזכורות לא יישלחו.</Alert>}
      {data.sub && ["suspended", "cancelled"].includes(data.sub.status) && (
        <Alert tone="error">המנוי אינו פעיל. תשלומים ותזכורות חדשים מושהים; תשלומים שכבר התחילו ימשיכו להיקלט.</Alert>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="חוב פתוח" value={<Money agorot={data.debt} />} />
        <Stat label="מתפללים עם חוב" value={<span className="num">{data.debtors} / {data.count}</span>} />
        <Stat label="ממתין לאישור" value={<Money agorot={data.pending} />} />
        <Stat label="יתרות זכות" value={<Money agorot={data.credit} />} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="משימות פתוחות" actions={<LinkButton href="/tasks" variant="secondary">לכל המשימות</LinkButton>}>
          {openTasks === 0 ? (
            <Empty>אין משימות פתוחות.</Empty>
          ) : (
            <ul className="space-y-1">
              {data.tasks.map((t) => (
                <li key={t.kind} className="flex justify-between">
                  <span>{TASK_LABEL[t.kind] ?? t.kind}</span>
                  <Badge tone="amber">{t._count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="תשלומים אחרונים" actions={<LinkButton href="/payments" variant="secondary">לתשלומים</LinkButton>}>
          {data.recent.length === 0 ? (
            <Empty>עדיין לא התקבלו תשלומים.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <Link className="text-brand-700 underline-offset-2 hover:underline" href={`/congregants/${p.congregant.id}`}>
                    {p.congregant.firstName} {p.congregant.lastName}
                  </Link>
                  <span className="text-sm text-slate-500">
                    {METHOD_LABEL[p.method]} · {fmtDate(p.receivedAt)}
                  </span>
                  <Money agorot={p.amountAgorot} className="font-medium" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/pledges/batch">קליטת נדרים אחרי שבת</LinkButton>
        <LinkButton href="/congregants/new" variant="secondary">
          מתפלל חדש
        </LinkButton>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
