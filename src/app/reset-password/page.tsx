"use client";
import { useState } from "react";
import { authClient } from "@/server/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";
import { AuthShell } from "@/components/brand";

export default function ResetPassword() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <AuthShell title="בחירת סיסמה חדשה">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const token = new URLSearchParams(window.location.search).get("token") ?? "";
          const newPassword = String(new FormData(e.currentTarget).get("password"));
          const { error } = await authClient.resetPassword({ newPassword, token });
          setMsg(error ? { ok: false, text: "הקישור אינו בתוקף או שהסיסמה קצרה מדי (לפחות 10 תווים)." } : { ok: true, text: "הסיסמה עודכנה. אפשר להיכנס." });
        }}
      >
        <Field label="סיסמה חדשה" hint="לפחות 10 תווים"><Input name="password" type="password" dir="ltr" minLength={10} autoComplete="new-password" required /></Field>
        <Button className="w-full" size="lg">שמירה</Button>
      </form>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text} {msg.ok && <a className="underline" href="/login">לכניסה</a>}</Alert>}
    </AuthShell>
  );
}
