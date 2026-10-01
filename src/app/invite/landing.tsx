"use client";
import { useEffect, useState } from "react";
import { acceptForSignedInAction, acceptNewAccountAction, inviteLandingAction } from "./actions";
import { authClient } from "@/server/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";
import { AuthShell } from "@/components/brand";

type Info = { synagogueName: string; firstName: string; suggestedEmail: string; signedInAs: string | null };
const NET = { ok: false as const, error: "אין חיבור לשרת. נסו שוב." };

// Invitation landing. The token is read from location.hash, so it never reaches server logs or other sites.
export default function InviteLanding() {
  const [token] = useState(() => window.location.hash.slice(1) || null);
  const [info, setInfo] = useState<Info | null>(null);
  const [stage, setStage] = useState<"loading" | "invalid" | "new" | "existing" | "signed-in" | "verify">(() => (token ? "loading" : "invalid"));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    history.replaceState(null, "", window.location.pathname);
    if (!token) return;
    inviteLandingAction(token).then(
      (r) => {
        if (!r.ok) return setStage("invalid");
        setInfo(r.data!);
        setStage(r.data!.signedInAs ? "signed-in" : "new");
      },
      () => setStage("invalid"),
    );
  }, [token]);

  const done = () => window.location.replace("/");

  if (stage === "loading") return <Shell><p>טוען…</p></Shell>;
  if (stage === "invalid")
    return (
      <Shell>
        <Alert tone="error">ההזמנה אינה בתוקף (כבר נוצלה, בוטלה או שפג תוקפה). אפשר לבקש הזמנה חדשה מהגבאי.</Alert>
        <p className="text-center text-sm"><a className="text-brand-700 underline" href="/login">לכניסה</a></p>
      </Shell>
    );
  return (
    <Shell title={info?.synagogueName}>
      <p>שלום {info?.firstName}, הוזמנת לאפליקציה של בית הכנסת – לצפייה בנדרים ובתשלומים שלך ולתשלום מאובטח.</p>

      {stage === "signed-in" && (
        <div className="space-y-3">
          <p className="text-sm">אתה מחובר כ-<span dir="ltr">{info?.signedInAs}</span>.</p>
          <Button
            className="w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await acceptForSignedInAction(token!).catch(() => NET);
              setBusy(false);
              if (!r.ok) return setErr(r.error);
              done();
            }}
          >
            צירוף הכרטיס לחשבון הזה
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={async () => {
              await authClient.signOut().catch(() => undefined);
              setStage("new");
            }}
          >
            זה לא אני – חשבון אחר
          </Button>
        </div>
      )}

      {stage === "new" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const email = String(f.get("email")).trim().toLowerCase();
            const password = String(f.get("password"));
            if (password !== String(f.get("password2"))) return setErr("הסיסמאות אינן זהות.");
            setBusy(true);
            setErr(null);
            const r = await acceptNewAccountAction(token!, { name: String(f.get("name")), email, password }).catch(() => NET);
            if (!r.ok) {
              setBusy(false);
              return setErr(r.error);
            }
            if (r.data?.needsVerification) {
              setBusy(false);
              setSentTo(email);
              return setStage("verify");
            }
            const s = await authClient.signIn.email({ email, password });
            setBusy(false);
            if (s.error) return window.location.replace("/login");
            done();
          }}
        >
          <h2 className="text-lg font-semibold">פתיחת חשבון</h2>
          <Field label="שם מלא"><Input name="name" defaultValue={info?.firstName} autoComplete="name" required /></Field>
          <Field label="דוא״ל"><Input name="email" type="email" dir="ltr" autoComplete="username" defaultValue={info?.suggestedEmail} required /></Field>
          <Field label="סיסמה (לפחות 10 תווים)"><Input name="password" type="password" dir="ltr" autoComplete="new-password" minLength={10} required /></Field>
          <Field label="אימות סיסמה"><Input name="password2" type="password" dir="ltr" autoComplete="new-password" minLength={10} required /></Field>
          <Button className="w-full" disabled={busy}>{busy ? "יוצר חשבון…" : "יצירת חשבון"}</Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => { setErr(null); setStage("existing"); }}>
            יש לי כבר חשבון
          </Button>
        </form>
      )}

      {stage === "existing" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setErr(null);
            const s = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
            if (s.error) {
              setBusy(false);
              return setErr(s.error.status === 403 ? "כתובת הדוא״ל עדיין לא אומתה. בדקו את תיבת הדואר." : "דוא״ל או סיסמה שגויים.");
            }
            const r = await acceptForSignedInAction(token!).catch(() => NET);
            setBusy(false);
            if (!r.ok) return setErr(r.error);
            done();
          }}
        >
          <h2 className="text-lg font-semibold">כניסה לחשבון קיים</h2>
          <Field label="דוא״ל"><Input name="email" type="email" dir="ltr" autoComplete="username" defaultValue={info?.suggestedEmail} required /></Field>
          <Field label="סיסמה"><Input name="password" type="password" dir="ltr" autoComplete="current-password" required /></Field>
          <Button className="w-full" disabled={busy}>כניסה וצירוף הכרטיס</Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => { setErr(null); setStage("new"); }}>
            חזרה לפתיחת חשבון חדש
          </Button>
        </form>
      )}

      {stage === "verify" && (
        <Alert tone="success">
          החשבון נוצר והכרטיס צורף. שלחנו קישור לאימות לכתובת <span dir="ltr">{sentTo}</span> – אחרי האימות אפשר להיכנס עם הדוא״ל והסיסמה.
        </Alert>
      )}
      {err && <Alert tone="error">{err}</Alert>}
    </Shell>
  );
}

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return <AuthShell title={title ?? "הזמנה לאפליקציה"}>{children}</AuthShell>;
}
