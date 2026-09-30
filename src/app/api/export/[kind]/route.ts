import { gabbaiSession } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { exportBalancesCsv, exportLedgerCsv, exportReportsCsv } from "@/server/gabbai/import-export";
import { canExport } from "@/server/billing/policy";
import { audit } from "@/server/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const g = await gabbaiSession();
  if (!g) return new Response("נדרשת התחברות", { status: 401 });
  const { kind } = await params;
  if (kind !== "balances" && kind !== "ledger" && kind !== "reports") return new Response("not found", { status: 404 });
  const csv = await withContext(g.ctx, async (tx) => {
    const sub = await tx.saaSSubscription.findUnique({ where: { tenantId: g.tenantId } });
    if (!canExport(sub)) return null;
    await audit(tx, g.tenantId, g.actor, `export.${kind}`);
    return kind === "balances" ? exportBalancesCsv(tx) : kind === "reports" ? exportReportsCsv(tx) : exportLedgerCsv(tx);
  }, { timeout: 120_000 });
  if (csv === null) return new Response("תקופת הגישה לייצוא הסתיימה", { status: 403 });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
