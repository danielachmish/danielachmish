import Link from "next/link";
import { CircleDollarSign, FileText } from "lucide-react";
import { requireAdmin } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { tenantSummaries } from "@/server/admin/dashboard";
import { planConfig } from "@/server/config";
import { Badge, Card, Empty, Money, PageHeader, Stat, fmtDate } from "@/components/ui";
import { SUB_LABEL, subTone } from "@/components/admin/labels";
import { ManualPaymentForm, SubscriptionControls } from "../forms";

export default async function AdminBilling() {
  const a = await requireAdmin();
  const tenants = await tenantSummaries(a.userId);
  const invoices = await withContext({ kind: "platform_admin", userId: a.userId }, (tx) => tx.saaSInvoice.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } }));
  const names = new Map(tenants.map((t) => [t.id, t.name]));
  const plan = planConfig();
  const count = (s: string) => tenants.filter((t) => t.subscription?.status === s).length;
  return (
    <>
      <PageHeader title="מנויים וחשבוניות" icon={FileText} subtitle="מצב המנוי של כל בית כנסת, חשבוניות פתוחות ותשלומים ידניים." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="פעילים" value={<span className="num">{count("active")}</span>} tone="green" />
        <Stat label="בניסיון" value={<span className="num">{count("trial")}</span>} />
        <Stat label="ממתינים לתשלום / חסד" value={<span className="num">{count("past_due") + count("grace")}</span>} tone="amber" />
        <Stat label="הכנסה חודשית צפויה" value={<Money agorot={count("active") * plan.priceAgorot} />} icon={CircleDollarSign} tone="amber" />
      </div>
      <Card title="חשבוניות פתוחות" icon={FileText}>
        {invoices.length === 0 ? (
          <Empty icon={FileText}>אין חשבוניות פתוחות.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                <Link className="font-medium text-brand-700 hover:underline" href={`/admin/tenants/${inv.tenantId}?tab=billing`}>{names.get(inv.tenantId) ?? "—"}</Link>
                <span className="text-slate-500">{fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</span>
                <Money agorot={inv.amountAgorot} className="font-semibold" />
                <span className="ms-auto"><ManualPaymentForm tenantId={inv.tenantId} invoiceId={inv.id} /></span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">גביית מנוי אוטומטית אמיתית טרם חוברה (החלטה פתוחה). אפשר לרשום תשלום ידני מתועד.</p>
      </Card>
      <Card title="כל המנויים" icon={CircleDollarSign}>
        {tenants.length === 0 ? (
          <Empty>אין בתי כנסת.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tenants.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={`/admin/tenants/${t.id}?tab=billing`} className="min-w-40 flex-1 font-medium hover:text-brand-700 hover:underline">{t.name}</Link>
                <Badge tone={subTone(t.subscription?.status)} dot>{SUB_LABEL[t.subscription?.status ?? ""] ?? "ללא מנוי"}</Badge>
                <span className="text-xs text-slate-500">
                  {t.subscription?.status === "trial" && t.subscription.trialEndsAt ? `ניסיון עד ${fmtDate(t.subscription.trialEndsAt)}` : t.subscription?.currentPeriodEnd ? `עד ${fmtDate(t.subscription.currentPeriodEnd)}` : ""}
                </span>
                {t.subscription && <SubscriptionControls tenantId={t.id} status={t.subscription.status} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
