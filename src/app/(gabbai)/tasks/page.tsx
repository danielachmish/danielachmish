import Link from "next/link";
import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { Badge, Card, Empty, LinkButton, fmtDateTime } from "@/components/ui";
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
      <h1 className="text-2xl font-bold">משימות</h1>
      {tasks.length === 0 ? (
        <Empty>אין משימות פתוחות.</Empty>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id}>
              <p className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone="amber">{TASK_LABEL[t.kind] ?? t.kind}</Badge>
                <span className="font-medium">{t.summary}</span>
                <span className="text-sm text-slate-500">{fmtDateTime(t.createdAt)}</span>
              </p>
              {t.name && <p className="mb-2 text-sm">מתפלל: <Link className="text-brand-700 hover:underline" href={`/congregants/${t.congregantId}`}>{t.name}</Link>{t.pausesReminders && " · תזכורות מושהות עד לטיפול"}</p>}
              {typeof (t.details as { text?: string } | null)?.text === "string" && <p className="mb-2 rounded bg-slate-50 p-2 text-sm">{(t.details as { text: string }).text}</p>}
              {t.kind === "external_payment" && t.paymentId ? <LinkButton href="/payments" variant="secondary">לאישור התשלום</LinkButton> : <ResolveTask taskId={t.id} />}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
