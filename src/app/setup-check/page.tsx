import { notFound } from "next/navigation";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { prisma } from "@/server/db/client";
import { appEnv } from "@/server/env";
import { AuthShell } from "@/components/brand";

// First-run diagnostics for the owner: is the deployment ready for the first admin sign-in?
// Shows yes/no only – never a secret, address or key. It disappears (404) once the admin has signed in.
export const dynamic = "force-dynamic";

type Row = { label: string; ok: boolean | null; detail?: string };

async function resendKeyCheck(key: string): Promise<{ ok: boolean; detail: string }> {
  try {
    // A sending-only key cannot list domains, but Resend says *why*: a valid restricted key is fine.
    const res = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    if (res.ok) return { ok: true, detail: "המפתח תקין" };
    const b = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
    if (b.name === "restricted_api_key") return { ok: true, detail: "המפתח תקין (הרשאת שליחה בלבד)" };
    return { ok: false, detail: `Resend דחה את המפתח: ${(b.message ?? b.name ?? res.status).toString().slice(0, 120)}` };
  } catch {
    return { ok: false, detail: "אין חיבור ל-Resend" };
  }
}

export default async function SetupCheck() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const rows: Row[] = [];
  rows.push({ label: "סביבת ייצור (APP_ENV=production)", ok: appEnv() === "production", detail: `כרגע: ${appEnv()}` });

  let admin: { id: string; emailVerified: boolean; platformRole: string } | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    rows.push({ label: "מסד הנתונים מחובר", ok: true });
    const demo = await prisma.user.count({ where: { email: { endsWith: "@example.test" } } });
    rows.push({ label: "אין חשבונות דמו במסד", ok: demo === 0, detail: demo ? `נמצאו ${demo} חשבונות דמו – יש לחבר מסד נקי` : undefined });
    if (adminEmail) admin = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true, emailVerified: true, platformRole: true } });
  } catch {
    rows.push({ label: "מסד הנתונים מחובר", ok: false, detail: "אין חיבור למסד – בדקו ב-Storage שהמסד מחובר ל-Production" });
  }

  // Once the admin has signed in, this page is no longer needed.
  if (admin && (await prisma.session.count({ where: { userId: admin.id } }).catch(() => 0)) > 0) notFound();

  rows.push({ label: "ADMIN_EMAIL מוגדר", ok: !!adminEmail });
  rows.push({
    label: "חשבון מנהל המערכת נוצר",
    ok: adminEmail ? !!admin && admin.platformRole === "admin" : null,
    detail: adminEmail && !admin ? "לא נוצר – הפעילו Redeploy אחרי שכל ההגדרות תקינות" : undefined,
  });

  const key = process.env.RESEND_API_KEY;
  rows.push({ label: "RESEND_API_KEY מוגדר", ok: !!key });
  if (key) {
    rows.push({ label: "המפתח בפורמט של Resend (מתחיל ב-re_)", ok: key.startsWith("re_") });
    const k = await resendKeyCheck(key);
    rows.push({ label: "Resend מקבל את המפתח", ok: k.ok, detail: k.detail });
  }
  const from = process.env.EMAIL_FROM ?? "";
  const fromDomain = /@([^>\s]+)>?\s*$/.exec(from)?.[1] ?? "";
  rows.push({
    label: "EMAIL_FROM משתמש בדומיין המאומת",
    // Resend sends only from the verified domain – never from a webmail address.
    ok: !!fromDomain && !/(gmail|yahoo|outlook|hotmail|walla)\./i.test(fromDomain),
    detail: from ? `דומיין השולח: ${fromDomain || "לא זוהה"}` : "לא מוגדר",
  });

  const allOk = rows.every((r) => r.ok !== false);
  return (
    <AuthShell title="בדיקת הקמה" subtitle={allOk ? "הכול תקין. אפשר לבקש קישור בשכחתי סיסמה." : "יש פריטים שצריך לתקן – פירוט למטה."}>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 text-sm">
            {r.ok === true ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="תקין" />
            ) : r.ok === false ? (
              <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" aria-label="לא תקין" />
            ) : (
              <MinusCircle className="mt-0.5 size-5 shrink-0 text-slate-400" aria-label="לא נבדק" />
            )}
            <span>
              <span className="font-medium">{r.label}</span>
              {r.detail && <span className="block text-xs text-slate-500">{r.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {allOk && (
        <a href="/forgot-password" className="block rounded-xl bg-brand-700 px-4 py-3 text-center font-medium text-white">
          לבקשת קישור לבחירת סיסמה
        </a>
      )}
    </AuthShell>
  );
}
