import { requireGabbai } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { BatchEntry } from "@/components/gabbai/batch-entry";

export default async function BatchPage() {
  const g = await requireGabbai();
  const people = await withContext(g.ctx, (tx) =>
    tx.congregant.findMany({ select: { id: true, firstName: true, lastName: true, phone: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
  );
  // Identical names get a distinguishing suffix (last phone digits) so the pick is never ambiguous.
  const base = people.map((p) => ({ id: p.id, name: `${p.lastName} ${p.firstName}`.trim(), phone: p.phone }));
  const counts = new Map<string, number>();
  base.forEach((p) => counts.set(p.name, (counts.get(p.name) ?? 0) + 1));
  const options = base.map((p) => ({ id: p.id, name: counts.get(p.name)! > 1 ? `${p.name} (${p.phone ? p.phone.slice(-4) : p.id.slice(-4)})` : p.name }));
  return (
    <>
      <h1 className="text-2xl font-bold">קליטת נדרים מרוכזת</h1>
      <p className="text-sm text-slate-600">
        חובה: מתפלל, סכום ותאריך. אנטר עובר לשדה הבא. הטיוטה נשמרת במכשיר עד השמירה – היא עדיין לא רשומה במערכת.
      </p>
      <BatchEntry people={options} draftKey={`batch-draft:${g.tenantId}`} />
    </>
  );
}
