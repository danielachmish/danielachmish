import "dotenv/config";
import { auth } from "../src/server/auth/auth";
import { prisma } from "../src/server/db/client";
import { withContext, tenantCtx, type Actor } from "../src/server/db/context";
import { createCongregant, recordConsent } from "../src/server/gabbai/congregants";
import { createPledge, recordVerifiedCardPayment, reportExternalPayment } from "../src/server/ledger/engine";
import { openInquiry, setOptOut } from "../src/server/portal/actions";
import { encryptJson } from "../src/server/crypto";

// Development seed – dummy data only. Refuses to run in production.
import { isProductionEnv } from "../src/server/env";

if (isProductionEnv()) throw new Error("seed is for development and demo only");

const PASSWORD = process.env.DEMO_PASSWORD || "demo-password-123";
const SHARED_PHONE = "050-1111111"; // same dummy phone in both synagogues

async function user(email: string, name: string, platformRole = "none") {
  let u = await prisma.user.findUnique({ where: { email } });
  if (!u) {
    await auth.api.signUpEmail({ body: { email, name, password: PASSWORD } });
    u = await prisma.user.findUniqueOrThrow({ where: { email } });
  } else if (process.env.DEMO_PASSWORD) {
    // Keep demo accounts in sync with the configured password (re-hashed with Better Auth's own hasher).
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(PASSWORD);
    await prisma.account.updateMany({ where: { userId: u.id, providerId: "credential" }, data: { password: hash } });
  }
  return prisma.user.update({ where: { id: u.id }, data: { emailVerified: true, platformRole } });
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);

async function synagogue(n: 1 | 2, name: string, gabbaiEmail: string, gabbaiName: string) {
  const g = await user(gabbaiEmail, gabbaiName);
  const existing = await withContext({ kind: "user", userId: g.id }, (tx) => tx.membership.findFirst({ where: { userId: g.id } }));
  if (existing) return console.log(`• ${name} already seeded`);
  const tenant = await withContext({ kind: "platform_admin", userId: "seed" }, async (tx) => {
    const t = await tx.tenant.create({ data: { name, city: n === 1 ? "ירושלים" : "בני ברק" } });
    await tx.membership.create({ data: { tenantId: t.id, userId: g.id } });
    await tx.saaSSubscription.create({
      data: { tenantId: t.id, status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) },
    });
    return t;
  });
  const tenantId = tenant.id;
  const actor: Actor = { type: "gabbai", id: g.id };
  const ctx = tenantCtx(tenantId, actor, g.id);

  await withContext(ctx, async (tx) => {
    const pay = await tx.integrationAccount.create({
      data: { tenantId, kind: "payment", provider: "fake", environment: "fake", externalAccountId: `pay-demo-${n}`, displayName: "סליקת דמה", encryptedSecrets: encryptJson({ webhookSecret: `demo-secret-${n}` }) },
    });
    await tx.integrationAccount.create({ data: { tenantId, kind: "messaging", provider: "fake", environment: "fake", externalAccountId: `wa-demo-${n}`, displayName: "וואטסאפ דמה" } });

    const mk = (firstName: string, lastName: string, phone: string | null) => createCongregant(tx, tenantId, actor, { firstName, lastName, phone });
    const shared = await mk("יוסף", n === 1 ? "כהן" : "לוי", SHARED_PHONE);
    await recordConsent(tx, tenantId, actor, shared.id, true);
    await createPledge(tx, tenantId, actor, { congregantId: shared.id, amountAgorot: n === 1 ? 18000 : 36000, pledgeDate: d("2026-08-15"), description: "עלייה לתורה" });

    if (n === 1) {
      // open debt
      const a = await mk("אברהם", "דוגמה", "050-2222222");
      await recordConsent(tx, tenantId, actor, a.id, true);
      await createPledge(tx, tenantId, actor, { congregantId: a.id, amountAgorot: 18000, pledgeDate: d("2026-09-01"), description: "שלישי" });
      await createPledge(tx, tenantId, actor, { congregantId: a.id, amountAgorot: 12000, pledgeDate: d("2026-09-05"), description: "מפטיר" });
      // partial payment
      const b = await mk("יצחק", "בדיקה", "050-3333333");
      await createPledge(tx, tenantId, actor, { congregantId: b.id, amountAgorot: 30000, pledgeDate: d("2026-08-20"), description: "נדר חגים" });
      await recordVerifiedCardPayment(tx, tenantId, { type: "provider", id: "seed" }, {
        congregantId: b.id, amountAgorot: 10000, currency: "ILS", integrationAccountId: pay.id,
        identity: { provider: "fake", environment: "fake", accountId: pay.externalAccountId, transactionId: "seed-tx-1" },
      });
      // credit
      const c = await mk("יעקב", "זכות", "050-4444444");
      await createPledge(tx, tenantId, actor, { congregantId: c.id, amountAgorot: 5000, pledgeDate: d("2026-08-01") });
      await reportExternalPayment(tx, tenantId, actor, { congregantId: c.id, amountAgorot: 15000, method: "cash", approveNow: true });
      // inquiry
      const e = await mk("שרה", "בירור", "050-5555555");
      await createPledge(tx, tenantId, actor, { congregantId: e.id, amountAgorot: 26000, pledgeDate: d("2026-07-10"), kind: "opening_balance", description: "יתרת פתיחה" });
      await openInquiry(tx, tenantId, e.id, "לדעתי שילמתי חלק מזה במזומן בחודש שעבר", "seed");
      // opted out
      const f = await mk("רבקה", "הסרה", "050-6666666");
      await recordConsent(tx, tenantId, actor, f.id, true);
      await createPledge(tx, tenantId, actor, { congregantId: f.id, amountAgorot: 9000, pledgeDate: d("2026-08-10") });
      await setOptOut(tx, tenantId, f.id, "seed", "congregant");
      // pending check (does not reduce debt until approved)
      const h = await mk("משה", "צק", "050-7777777");
      await createPledge(tx, tenantId, actor, { congregantId: h.id, amountAgorot: 20000, pledgeDate: d("2026-08-25") });
      await reportExternalPayment(tx, tenantId, actor, { congregantId: h.id, amountAgorot: 20000, method: "check", reference: "004512" });
      // no phone
      const i = await mk("דוד", "בלי טלפון", null);
      await createPledge(tx, tenantId, actor, { congregantId: i.id, amountAgorot: 5400, pledgeDate: d("2026-09-10") });
    } else {
      const a = await mk("אליהו", "שני", "050-8888888");
      await createPledge(tx, tenantId, actor, { congregantId: a.id, amountAgorot: 50000, pledgeDate: d("2026-09-01") });
    }
  });
  console.log(`✓ ${name} (gabbai ${gabbaiEmail})`);
}

async function main() {
  await user("admin@example.test", "מנהל השירות", "admin");
  await synagogue(1, "בית כנסת אוהל יעקב (דמו)", "gabbai1@example.test", "גבאי ראשון");
  await synagogue(2, "בית כנסת היכל שלמה (דמו)", "gabbai2@example.test", "גבאי שני");
  console.log(`\nDemo logins: admin@example.test, gabbai1@example.test, gabbai2@example.test${process.env.DEMO_PASSWORD ? "" : ` (password "${PASSWORD}")`}`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
