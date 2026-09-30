import { LoginForm } from "./login-form";
import { isDemo } from "@/server/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold">כניסת גבאי</h1>
      <p className="text-sm">
        מתפלל? <a href="/enter" className="text-brand-700 underline">כניסה עם מספר טלפון</a>
      </p>
      <LoginForm notice={e === "no_membership" ? "החשבון אינו משויך לבית כנסת פעיל. פנו לצוות השירות." : undefined} />
      {isDemo() && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm">
          משתמשי הדגמה: <span dir="ltr">gabbai1@example.test</span> (גבאי), <span dir="ltr">admin@example.test</span> (מנהל השירות). הסיסמה נקבעה בהגדרות הפרויקט (DEMO_PASSWORD).
        </p>
      )}
    </main>
  );
}
