"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Check, Mail, UserRound } from "lucide-react";
import { onboardAction } from "../actions";
import { Alert, Button, Field, Input, cx } from "@/components/ui";

type Data = { name: string; city: string; gabbaiName: string; gabbaiEmail: string };
const STEPS = [
  { label: "בית הכנסת", icon: Building2 },
  { label: "הגבאי הראשי", icon: UserRound },
  { label: "אישור ושליחה", icon: Mail },
];

/** Three short steps; nothing is created until the last one is confirmed. */
export function OnboardWizard({ emailReady }: { emailReady: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Data>({ name: "", city: "", gabbaiName: "", gabbaiEmail: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Data) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });

  return (
    <div className="space-y-5">
      <ol className="flex items-center gap-2" aria-label="שלבים">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex flex-1 items-center gap-2">
            <span className={cx("grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold", i < step ? "bg-emerald-500 text-white" : i === step ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-400")} aria-current={i === step ? "step" : undefined}>
              {i < step ? <Check className="size-4.5" aria-hidden /> : i + 1}
            </span>
            <span className={cx("hidden text-sm font-medium sm:block", i === step ? "text-slate-900" : "text-slate-500")}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" aria-hidden />}
          </li>
        ))}
      </ol>

      <form
        className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (step < 2) return setStep(step + 1);
          setBusy(true);
          const r = await onboardAction({ name: d.name, city: d.city, gabbaiName: d.gabbaiName, gabbaiEmail: d.gabbaiEmail }).catch(() => ({ ok: false as const, error: "אין חיבור לשרת." }));
          setBusy(false);
          if (!r.ok) return setErr(r.error);
          router.push(`/admin/tenants/${r.data!.tenantId}`);
          router.refresh();
        }}
      >
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold">פרטי בית הכנסת</h2>
            <Field label="שם בית הכנסת"><Input value={d.name} onChange={set("name")} required autoFocus /></Field>
            <Field label="עיר" hint="רשות"><Input value={d.city} onChange={set("city")} /></Field>
          </>
        )}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold">הגבאי הראשי</h2>
            <p className="text-sm text-slate-600">הגבאי מנהל את בית הכנסת במערכת. הוא יקבל מייל עם קישור לבחירת סיסמה – את הסיסמה אתה לא רואה.</p>
            <Field label="שם הגבאי"><Input value={d.gabbaiName} onChange={set("gabbaiName")} required autoFocus /></Field>
            <Field label="דוא״ל הגבאי"><Input type="email" dir="ltr" value={d.gabbaiEmail} onChange={set("gabbaiEmail")} required /></Field>
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold">אישור ושליחה</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">בית הכנסת</dt><dd className="mt-0.5 font-medium">{d.name}{d.city ? `, ${d.city}` : ""}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">הגבאי</dt><dd className="mt-0.5 font-medium">{d.gabbaiName} · <span dir="ltr">{d.gabbaiEmail}</span></dd></div>
            </dl>
            <ul className="list-disc space-y-1 ps-5 text-sm text-slate-600">
              <li>נפתחת תקופת ניסיון, וברירות המחדל מ״הגדרות מערכת״ מוחלות על בית הכנסת.</li>
              <li>הגבאי מקבל מייל לבחירת סיסמה ונכנס ישר ללוח הבקרה שלו.</li>
            </ul>
            {!emailReady && <Alert tone="warn">שליחת דוא״ל עוד לא הוגדרה – אי אפשר לשלוח לגבאי את הקישור.</Alert>}
          </>
        )}
        {err && <Alert tone="error">{err}</Alert>}
        <div className="flex items-center justify-between gap-2 pt-1">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => { setErr(null); setStep(step - 1); }}>חזרה</Button>
          ) : (
            <span />
          )}
          <Button disabled={busy || (step === 2 && !emailReady)}>{step < 2 ? "המשך" : busy ? "יוצר…" : "יצירה ושליחת הזמנה"}</Button>
        </div>
      </form>
    </div>
  );
}
