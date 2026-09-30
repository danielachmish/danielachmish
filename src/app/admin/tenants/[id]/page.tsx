import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { cardSummary } from "@/server/ledger/balance";
import { audit } from "@/server/audit";
import { Alert, Card, LinkButton, Money } from "@/components/ui";
import { ReplaceGabbaiForm } from "../../forms";

export default async function AdminTenant({ params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const tenant = await withContext({ kind: "platform_admin", userId: a.userId }, (tx) => tx.tenant.findUnique({ where: { id } }));
  if (!tenant) notFound();
  // Congregant data only with an active, unexpired grant from the head gabbai. Every view is audited.
  const view = await withContext({ kind: "tenant", tenantId: id, userId: a.userId, actor: a.actor }, async (tx) => {
    const grant = await tx.supportGrant.findFirst({ where: { granteeUserId: a.userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "desc" } });
    if (!grant || grant.scope !== "read_ledger") return { grant, rows: null };
    await audit(tx, id, a.actor, "support.view_ledger", { type: "SupportGrant", id: grant.id });
    const cs = await tx.congregant.findMany({ select: { id: true, firstName: true, lastName: true } });
    return { grant, rows: await Promise.all(cs.map(async (c) => ({ ...c, s: await cardSummary(tx, c.id) }))) };
  });
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-4">
      <LinkButton href="/admin" variant="secondary">חזרה</LinkButton>
      <h1 className="text-2xl font-bold">{tenant.name}</h1>
      <Card title="החלפת גבאי ראשי">
        <ReplaceGabbaiForm tenantId={id} />
      </Card>
      <Card title="נתוני בית הכנסת (בהרשאת גבאי בלבד)">
        {!view.grant ? (
          <Alert>אין הרשאת תמיכה פעילה. הגבאי יכול לתת גישה זמנית ממסך ההגדרות.</Alert>
        ) : !view.rows ? (
          <Alert>ההרשאה הפעילה מוגבלת לחיבורים בלבד.</Alert>
        ) : (
          <>
            <Alert tone="warn">גישה זמנית עד {view.grant.expiresAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })} · מטרה: {view.grant.reason}. הצפייה מתועדת.</Alert>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {view.rows.map((r) => <li key={r.id} className="flex justify-between py-1"><span>{r.firstName} {r.lastName}</span><Money agorot={r.s.debtAgorot} /></li>)}
            </ul>
          </>
        )}
      </Card>
    </main>
  );
}
