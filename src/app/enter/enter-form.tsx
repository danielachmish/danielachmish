"use client";
import { useState } from "react";
import { startPhoneLoginAction, verifyPhoneLoginAction } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";
import { AuthShell } from "@/components/brand";

const NET = { ok: false as const, error: "אין חיבור לשרת. נסו שוב." };

export function EnterForm() {
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [ticket, setTicket] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <AuthShell
      title="כניסת מתפללים"
      subtitle="צפייה בחובות ובתשלומים שלך ותשלום מאובטח. נשלח קוד חד-פעמי לפרטי הקשר הרשומים אצל הגבאי."
      footer={<a className="font-medium text-brand-700 hover:underline" href="/login">כניסה עם דוא״ל וסיסמה</a>}
    >
      {stage === "phone" ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            const r = await startPhoneLoginAction(String(new FormData(e.currentTarget).get("phone"))).catch(() => NET);
            setBusy(false);
            if (!r.ok) return setErr(r.error);
            setTicket(r.data!.ticket);
            setStage("code");
          }}
        >
          <Field label="מספר טלפון נייד">
            <Input name="phone" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" placeholder="050-1234567" required />
          </Field>
          <Button className="w-full" size="lg" disabled={busy}>{busy ? "שולח…" : "שליחת קוד"}</Button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            const r = await verifyPhoneLoginAction(ticket, String(new FormData(e.currentTarget).get("code"))).catch(() => NET);
            setBusy(false);
            if (!r.ok) return setErr(r.error);
            window.location.replace("/me");
          }}
        >
          <Alert>אם המספר רשום באחד מבתי הכנסת, נשלח קוד בן 6 ספרות לטלפון או לדוא״ל הרשום בכרטיס. לא הגיע קוד? פנו לגבאי.</Alert>
          <Field label="קוד בן 6 ספרות">
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} dir="ltr" required autoFocus className="text-center text-2xl tracking-[0.5em]" />
          </Field>
          <Button className="w-full" size="lg" disabled={busy}>אימות וכניסה</Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => { setStage("phone"); setErr(null); }}>
            מספר אחר / שליחה מחדש
          </Button>
        </form>
      )}
      {err && <Alert tone="error">{err}</Alert>}
    </AuthShell>
  );
}
