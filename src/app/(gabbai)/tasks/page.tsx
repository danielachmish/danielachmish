import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { ListChecks, User } from "lucide-react";
import { Badge, Empty, LinkButton, PageHeader, fmtDateTime } from "@/components/ui";
import { ResolveTask } from "@/components/gabbai/decisions";
import { TASK_LABEL } from "@/components/labels";

export default async function Tasks() {
  const g = await requireGabbai();
  const tasks = await withContext(g.ctx, async (tx) => {
    const t = await tx.task.findMany({ where: { status: "open" }, orderBy: { createdAt: "asc" } });
    const ids = [...new Set(t.map((x) => x.congregantId).filter(Boolean))] as string[];
    const people = await tx.congregant.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    const name = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    return t.map((x) => ({ ...x, name: x.congregantId ? name.get(x.congregantId) : null }));
  });
  return (
    <>
      <PageHeader title="משימות" icon={ListChecks} subtitle={tasks.length ? <><span className="num">{tasks.length}</span> משימות פתוחות – מהישנה לחדשה</> : undefined} />
      {tasks.length === 0 ? (
        <Empty icon={ListChecks}>אין משימות פתוחות. הכול מטופל.</Empty>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <section key={t.id} className="rounded-2xl border border-slate-200/80 border-s-4 border-s-gold-400 bg-white p-5 shadow-card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Badge tone="gold" dot>{TASK_LABEL[t.kind] ?? t.kind}</Badge>
                <span className="text-xs text-slate-400">{fmtDateTime(t.createdAt)}</span>
              </div>
              <p className="font-semibold">{t.summary}</p>
              {t.name && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                  <User className="size-4 text-slate-400" aria-hidden />
                  <Link className="font-medium text-brand-700 hover:underline" href={`/congregants/${t.congregantId}`}>{t.name}</Link>
                  {t.pausesReminders && <Badge>תזכורות מושהות עד לטיפול</Badge>}
                </p>
              )}
              {typeof (t.details as { text?: string } | null)?.text === "string" && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed">{(t.details as { text: string }).text}</p>}
              <div className="mt-4">
                {t.kind === "external_payment" && t.paymentId ? <LinkButton href="/payments" variant="secondary">לאישור התשלום</LinkButton> : <ResolveTask taskId={t.id} />}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
