"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/server/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ notice }: { notice?: string }) {
  const [err, setErr] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
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
        window.location.href = "/";
      }}
    >
      <Field label="דוא״ל"><Input name="email" type="email" dir="ltr" autoComplete="username" required /></Field>
      <Field label="סיסמה"><Input name="password" type="password" dir="ltr" autoComplete="current-password" required /></Field>
      <Button className="w-full" disabled={busy}>{busy ? "נכנס…" : "כניסה"}</Button>
      {err && <Alert tone="error">{err}</Alert>}
      <p className="text-center text-sm"><Link className="text-brand-700 hover:underline" href="/forgot-password">שכחתי סיסמה</Link></p>
    </form>
  );
}
