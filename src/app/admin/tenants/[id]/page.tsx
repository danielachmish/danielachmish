import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowRight, Building2, CalendarDays, CreditCard, Eye, FileText, MessageCircle, MessageSquare, UserCog, Users, Wallet } from "lucide-react";
import { requireAdmin } from "@/server/auth/session";
import { withContext } from "@/server/db/context";
import { cardSummary } from "@/server/ledger/balance";
import { audit } from "@/server/audit";
import { tenantSummaries } from "@/server/admin/dashboard";
import { integrationStatus } from "@/server/integrations/connect";
import { providersFor } from "@/server/integrations/catalog";
import { modeFor } from "@/server/env";
import { embeddedSignupConfig } from "@/server/integrations/whatsapp-signup";
import { planConfig } from "@/server/config";
import { IntegrationPanel } from "@/components/integration-panel";
import { Alert, Badge, Card, Empty, Money, PageHeader, Stat, Tabs, fmtDate, fmtDateTime } from "@/components/ui";
import { SUB_LABEL, subTone } from "@/components/admin/labels";
import { ManualPaymentForm, ReplaceGabbaiForm, SubscriptionControls } from "../../forms";

const TABS = [
  ["overview", "סקירה"],
  ["billing", "מנוי"],
  ["integrations", "חיבורים"],
  ["gabbai", "גבאי"],
  ["support", "תמיכה"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function AdminTenant({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const a = await requireAdmin();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const tab: Tab = (TABS.map((t) => t[0]) as string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "overview";
  const t = (await tenantSummaries(a.userId)).find((x) => x.id === id);
  if (!t) notFound();
  const base = `/admin/tenants/${id}`;

  return (
    <>
      <PageHeader
        title={t.name}
        icon={Building2}
        subtitle={<>{t.city ? `${t.city} · ` : ""}הצטרף {fmtDate(t.createdAt)}</>}
        actions={<Badge tone={subTone(t.subscription?.status)} dot>{SUB_LABEL[t.subscription?.status ?? ""] ?? "ללא מנוי"}</Badge>}
        back={
          <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700">
            <ArrowRight className="size-4" aria-hidden /> כל בתי הכנסת
          </Link>
        }
      />
      <Tabs active={`${base}?tab=${tab}`} items={TABS.map(([k, label]) => ({ href: `${base}?tab=${k}`, label, count: k === "support" ? t.openCases : undefined }))} />

      {tab === "overview" && <Overview t={t} />}
      {tab === "billing" && <Billing tenantId={id} adminId={a.userId} status={t.subscription?.status ?? null} />}
      {tab === "integrations" && <Integrations tenantId={id} admin={a} />}
      {tab === "gabbai" && (
        <Card title="הגבאי הראשי" icon={UserCog}>
          {t.gabbai ? (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
              <span className="font-medium">{t.gabbai.name}</span>
              <span dir="ltr" className="text-slate-600">{t.gabbai.email}</span>
              {t.gabbaiSignedIn ? <Badge tone="green" dot>נכנס למערכת</Badge> : <Badge tone="amber" dot>עוד לא נכנס</Badge>}
            </div>
          ) : (
            <Alert tone="warn">אין גבאי ראשי פעיל.</Alert>
          )}
          <h3 className="mb-2 font-semibold">החלפת גבאי ראשי</h3>
          <p className="mb-3 text-sm text-slate-600">הגבאי הנוכחי מאבד גישה מיד. הגבאי החדש מקבל קישור לבחירת סיסמה. הפעולה מתועדת עם הסיבה.</p>
          <ReplaceGabbaiForm tenantId={id} />
        </Card>
      )}
      {tab === "support" && <Support tenantId={id} admin={a} />}
    </>
  );
}

function Overview({ t }: { t: Awaited<ReturnType<typeof tenantSummaries>>[number] }) {
  const steps = [
    ["הצטרף לשירות", t.createdAt],
    ["הגבאי נכנס", t.gabbaiSignedIn ? true : null],
    ["נדר ראשון", t.firstPledgeAt],
    ["תשלום ראשון", t.firstPaymentAt],
  ] as const;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="מתפללים" value={<span className="num">{t.congregants}</span>} icon={Users} />
        <Stat label="נדרים" value={<span className="num">{t.pledges}</span>} icon={FileText} tone="amber" />
        <Stat label="תשלומים שאושרו" value={<span className="num">{t.payments}</span>} icon={CreditCard} tone="green" />
        <Stat label="הודעות ב-30 יום" value={<span className="num">{t.messages30d}</span>} hint={<>מכסה: <span className="num">{planConfig().monthlyMessageQuota}</span> בחודש</>} icon={MessageSquare} tone="slate" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="התקדמות" icon={CalendarDays}>
          <ol className="space-y-3">
            {steps.map(([label, v]) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${v ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{v ? "✓" : "·"}</span>
                <span className="flex-1 font-medium">{label}</span>
                <span className="text-slate-500">{v instanceof Date ? fmtDate(v) : v ? "כן" : "עדיין לא"}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-slate-500">פעילות אחרונה: {t.lastActivityAt ? fmtDateTime(t.lastActivityAt) : "אין עדיין"}</p>
        </Card>
        <Card title="מצב טכני" icon={Wallet} description="ספירות בלבד">
          <ul className="space-y-2 text-sm">
            {t.integrations.length === 0 && <li className="text-slate-500">לא חוברו סליקה או וואטסאפ.</li>}
            {t.integrations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={i.status === "active" && !i.lastError ? "blue" : "red"} dot>{i.kind === "payment" ? "סליקה" : "וואטסאפ"}</Badge>
                <span className="text-slate-600">{i.provider} · {i.environment}</span>
                {i.lastError && <span className="text-xs text-red-700">תקלה {i.lastErrorAt ? fmtDate(i.lastErrorAt) : ""}</span>}
              </li>
            ))}
            {t.health && (
              <li className="pt-2 text-xs text-slate-500">
                אירועים ממתינים <span className="num">{t.health.pendingEvents}</span> · חריגים פתוחים <span className="num">{t.health.openExceptionTasks}</span> · הודעות שנכשלו (7 ימים) <span className="num">{t.health.failedMessages}</span>
              </li>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}

async function Billing({ tenantId, adminId, status }: { tenantId: string; adminId: string; status: string | null }) {
  const { sub, invoices } = await withContext({ kind: "platform_admin", userId: adminId }, async (tx) => ({
    sub: await tx.saaSSubscription.findUnique({ where: { tenantId } }),
    invoices: await tx.saaSInvoice.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 24 }),
  }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="מנוי" icon={FileText}>
        {sub ? (
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">מצב</dt><dd className="mt-0.5 font-medium">{SUB_LABEL[sub.status] ?? sub.status}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">ניסיון עד</dt><dd className="mt-0.5 font-medium">{sub.trialEndsAt ? fmtDate(sub.trialEndsAt) : "—"}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">תקופה נוכחית עד</dt><dd className="mt-0.5 font-medium">{sub.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd) : "—"}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">הודעות בתקופה</dt><dd className="num mt-0.5 font-medium">{sub.messagesUsed}</dd></div>
          </dl>
        ) : (
          <Alert tone="warn">אין מנוי רשום.</Alert>
        )}
        {status && <SubscriptionControls tenantId={tenantId} status={status} />}
      </Card>
      <Card title="חשבוניות" icon={FileText}>
        {invoices.length === 0 ? (
          <Empty icon={FileText}>אין חשבוניות.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {invoices.map((inv) => (
              <li key={inv.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</span>
                  <span className="flex items-center gap-2"><Money agorot={inv.amountAgorot} className="font-semibold" /><Badge tone={inv.status === "paid" ? "green" : "amber"}>{inv.status === "paid" ? "שולם" : "פתוח"}</Badge></span>
                </div>
                {inv.status === "open" && <div className="mt-2"><ManualPaymentForm tenantId={tenantId} invoiceId={inv.id} /></div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

async function Integrations({ tenantId, admin }: { tenantId: string; admin: Awaited<ReturnType<typeof requireAdmin>> }) {
  const integrations = await withContext({ kind: "tenant", tenantId, userId: admin.userId, actor: admin.actor }, (tx) => integrationStatus(tx));
  return (
    <>
      <Card title="חיבור סליקה (החשבון של בית הכנסת)" icon={Wallet}>
        <p className="mb-3 text-sm text-slate-600">הכסף של המתפללים נכנס ישירות לחשבון של בית הכנסת. אפשר לחבר כאן בשמו; הגבאי רואה את החיבור וכל שינוי מתועד.</p>
        <IntegrationPanel kind="payment" providers={providersFor("payment", modeFor("payment"))} current={integrations.payment} target={{ type: "admin", tenantId }} />
      </Card>
      <Card title="חיבור וואטסאפ של בית הכנסת" icon={MessageCircle}>
        <IntegrationPanel kind="messaging" providers={providersFor("messaging", modeFor("messaging"))} current={integrations.messaging} target={{ type: "admin", tenantId }} embeddedSignup={embeddedSignupConfig()} />
      </Card>
    </>
  );
}

async function Support({ tenantId, admin }: { tenantId: string; admin: Awaited<ReturnType<typeof requireAdmin>> }) {
  // Congregant data only with an active, unexpired grant from the head gabbai. Every view is audited.
  const view = await withContext({ kind: "tenant", tenantId, userId: admin.userId, actor: admin.actor }, async (tx) => {
    const grant = await tx.supportGrant.findFirst({ where: { granteeUserId: admin.userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "desc" } });
    if (!grant || grant.scope !== "read_ledger") return { grant, rows: null };
    await audit(tx, tenantId, admin.actor, "support.view_ledger", { type: "SupportGrant", id: grant.id });
    const cs = await tx.congregant.findMany({ select: { id: true, firstName: true, lastName: true } });
    return { grant, rows: await Promise.all(cs.map(async (c) => ({ ...c, s: await cardSummary(tx, c.id) }))) };
  });
  return (
    <Card title="נתוני בית הכנסת (בהרשאת גבאי בלבד)" icon={Eye}>
      {!view.grant ? (
        <Alert>אין הרשאת תמיכה פעילה. הגבאי יכול לתת גישה זמנית ממסך ההגדרות.</Alert>
      ) : !view.rows ? (
        <Alert>ההרשאה הפעילה מוגבלת לחיבורים בלבד.</Alert>
      ) : (
        <>
          <Alert tone="warn">גישה זמנית עד {fmtDateTime(view.grant.expiresAt)} · מטרה: {view.grant.reason}. הצפייה מתועדת.</Alert>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {view.rows.map((r) => (
              <li key={r.id} className="flex justify-between py-1.5">
                <span>{r.firstName} {r.lastName}</span>
                <Money agorot={r.s.debtAgorot} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
