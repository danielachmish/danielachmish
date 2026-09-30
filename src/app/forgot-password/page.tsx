"use client";
import { useState } from "react";
import { authClient } from "@/server/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function ForgotPassword() {
  const [done, setDone] = useState(false);
  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold">שחזור גישה</h1>
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
          <Button className="w-full">שליחת קישור לאיפוס</Button>
        </form>
      )}
    </main>
  );
}
