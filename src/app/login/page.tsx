import { LoginForm } from "./login-form";
import { isDemo } from "@/server/env";
import { loginSettings } from "@/server/auth/login-settings";

const NOTICE: Record<string, string> = {
  no_membership: "החשבון אינו משויך לבית כנסת או לכרטיס מתפלל פעיל. פנו לגבאי או לצוות השירות.",
  reauth: "מטעמי אבטחה יש להתחבר מחדש לעמדת הניהול.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const { phoneLogin } = await loginSettings();
  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold">כניסה</h1>
      <p className="text-sm text-slate-600">לגבאים, למתפללים ולצוות השירות. מתפללים מקבלים הזמנה לפתיחת חשבון מהגבאי.</p>
      <LoginForm notice={e ? NOTICE[e] : undefined} />
      {phoneLogin && (
        <p className="text-center text-sm">
          <a href="/enter" className="text-brand-700 underline">כניסה עם מספר טלפון וקוד</a>
        </p>
      )}
      {isDemo() && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm">
          משתמשי הדגמה: <span dir="ltr">gabbai1@example.test</span> (גבאי), <span dir="ltr">mitpalel@example.test</span> (מתפלל),{" "}
          <span dir="ltr">admin@example.test</span> (מנהל המערכת). הסיסמה נקבעה בהגדרות הפרויקט (DEMO_PASSWORD).
        </p>
      )}
    </main>
  );
}
