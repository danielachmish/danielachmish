import { Smartphone } from "lucide-react";
import { LoginForm } from "./login-form";
import { isDemo } from "@/server/env";
import { loginSettings } from "@/server/auth/login-settings";
import { AuthShell } from "@/components/brand";

const NOTICE: Record<string, string> = {
  no_membership: "החשבון אינו משויך לבית כנסת או לכרטיס מתפלל פעיל. פנו לגבאי או לצוות השירות.",
  reauth: "מטעמי אבטחה יש להתחבר מחדש לעמדת הניהול.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const { phoneLogin } = await loginSettings();
  return (
    <AuthShell
      title="כניסה"
      subtitle="לגבאים, למתפללים ולצוות השירות. מתפללים מקבלים הזמנה לפתיחת חשבון מהגבאי."
      footer={
        isDemo() && (
          <p className="rounded-2xl border border-gold-200 bg-gold-50 p-3 text-start text-xs leading-relaxed text-slate-700">
            <b>משתמשי הדגמה:</b> <span dir="ltr">gabbai1@example.test</span> (גבאי), <span dir="ltr">mitpalel@example.test</span> (מתפלל),{" "}
            <span dir="ltr">admin@example.test</span> (מנהל המערכת). הסיסמה נקבעה בהגדרות הפרויקט (DEMO_PASSWORD).
          </p>
        )
      }
    >
      <LoginForm notice={e ? NOTICE[e] : undefined} />
      {phoneLogin && (
        <>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            או
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <a href="/enter" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 font-medium text-slate-800 hover:bg-slate-50">
            <Smartphone className="size-4.5" aria-hidden />
            כניסה עם מספר טלפון וקוד
          </a>
        </>
      )}
    </AuthShell>
  );
}
