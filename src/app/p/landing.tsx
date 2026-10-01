"use client";
import { useEffect, useState } from "react";
import { landingAction, requestOtpAction, verifyOtpAction } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";
import { AuthShell } from "@/components/brand";

// Personal link landing. The token is read from location.hash, so it never reaches server logs or other sites.
export default function PortalLanding() {
  // Rendered client-only (see page.tsx), so reading the fragment during initialisation is safe.
  const [token] = useState(() => window.location.hash.slice(1) || null);
  const [info, setInfo] = useState<{ synagogueName: string; target: { kind: "phone" | "email"; masked: string } | null } | null>(null);
  const [stage, setStage] = useState<"loading" | "start" | "code" | "invalid">(() => (token ? "loading" : "invalid"));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Remove the token from the address bar / history once read.
    history.replaceState(null, "", window.location.pathname);
    if (!token) return;
    landingAction(token).then((r) => {
      if (r.ok) {
        setInfo(r.data!);
        setStage("start");
      } else setStage("invalid");
    }, () => setStage("invalid"));
  }, [token]);

  if (stage === "loading") return <Shell><p>טוען…</p></Shell>;
  if (stage === "invalid")
    return (
      <Shell>
        <Alert tone="error">הקישור אינו בתוקף. אפשר לבקש קישור חדש מהגבאי או לשלוח ״1״ בוואטסאפ של בית הכנסת.</Alert>
      </Shell>
    );
  return (
    <Shell title={info?.synagogueName}>
      {stage === "start" && (
        <div className="space-y-3">
          <p>
            לצפייה ביתרה ובתשלום נשלח קוד אימות {info?.target?.kind === "email" ? "לדוא״ל" : "לטלפון"}{" "}
            {info?.target ? <span className="num" dir="ltr">{info.target.masked}</span> : "הרשום"}.
          </p>
          <Button
            className="w-full"
            disabled={busy || !info?.target}
            onClick={async () => {
              setBusy(true);
              const r = await requestOtpAction(token!).catch(() => ({ ok: false as const, error: "אין חיבור. נסו שוב." }));
              setBusy(false);
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setStage("code");
              setMsg(null);
            }}
          >
            שליחת קוד
          </Button>
          {!info?.target && <Alert tone="warn">לכרטיס אין פרטי קשר לשליחת קוד. פנו לגבאי.</Alert>}
        </div>
      )}
      {stage === "code" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const code = String(new FormData(e.currentTarget).get("code"));
            setBusy(true);
            const r = await verifyOtpAction(token!, code).catch(() => ({ ok: false as const, error: "אין חיבור. נסו שוב." }));
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.error });
            window.location.replace("/me");
          }}
        >
          <Field label="קוד בן 6 ספרות">
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} dir="ltr" required autoFocus className="text-center text-2xl tracking-[0.5em]" />
          </Field>
          <Button className="w-full" disabled={busy}>אימות</Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setStage("start")}>לא קיבלתי קוד</Button>
        </form>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </Shell>
  );
}

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return <AuthShell title={title ?? "העמוד האישי"}>{children}</AuthShell>;
}
