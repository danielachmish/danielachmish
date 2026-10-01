"use client";
import { useState } from "react";
import { authClient } from "@/server/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";
import { AuthShell } from "@/components/brand";

export default function ForgotPassword() {
  const [done, setDone] = useState(false);
  return (
    <AuthShell title="שחזור גישה" subtitle="נשלח קישור לבחירת סיסמה חדשה לכתובת הדוא״ל שלכם." footer={<a className="font-medium text-brand-700 hover:underline" href="/login">חזרה לכניסה</a>}>
      {done ? (
        <Alert tone="success">אם הכתובת רשומה, נשלח אליה קישור לאיפוס הסיסמה.</Alert>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const email = String(new FormData(e.currentTarget).get("email"));
            await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }).catch(() => {});
            setDone(true); // same answer whether or not the address exists
          }}
        >
          <Field label="דוא״ל"><Input name="email" type="email" dir="ltr" required /></Field>
          <Button className="w-full" size="lg">שליחת קישור לאיפוס</Button>
        </form>
      )}
    </AuthShell>
  );
}
