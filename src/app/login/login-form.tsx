"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/server/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        const { error } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
        setBusy(false);
        if (error) {
          setErr(
            error.status === 429
              ? "יותר מדי ניסיונות כניסה. המתינו דקה ונסו שוב."
              : error.status === 403
                ? "כתובת הדוא״ל עדיין לא אומתה. בדקו את תיבת הדואר."
                : "דוא״ל או סיסמה שגויים.",
          );
          return;
        }
        router.replace("/");
        router.refresh();
      }}
    >
      <Field label="דוא״ל"><Input name="email" type="email" dir="ltr" autoComplete="username" required /></Field>
      <Field label="סיסמה"><Input name="password" type="password" dir="ltr" autoComplete="current-password" required /></Field>
      <div className="flex justify-end">
        <Link className="text-sm font-medium text-brand-700 hover:underline" href="/forgot-password">שכחתי סיסמה</Link>
      </div>
      <Button className="w-full" size="lg" disabled={busy}>{busy ? "נכנס…" : "כניסה"}</Button>
      {err && <Alert tone="error">{err}</Alert>}
    </form>
  );
}
