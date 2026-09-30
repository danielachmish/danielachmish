"use client";
import { useState } from "react";
import { authClient } from "@/server/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function ResetPassword() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold">בחירת סיסמה חדשה</h1>
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
        <Button className="w-full">שמירה</Button>
      </form>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text} {msg.ok && <a className="underline" href="/login">לכניסה</a>}</Alert>}
    </main>
  );
}
