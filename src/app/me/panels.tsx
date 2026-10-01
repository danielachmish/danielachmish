"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { inquiryAction, logoutAction, optOutAction, payAction, reportPaidAction, switchSynagogueAction } from "./actions";
import { authClient } from "@/server/auth/client";
import { HelpCircle, Lock, ReceiptText } from "lucide-react";
import { Alert, Button, Card, Field, Input, Money, Select, Textarea } from "@/components/ui";

const NET = { ok: false as const, error: "אין חיבור לשרת. נסו שוב." };

export function PayPanel({
  congregantId,
  debtAgorot,
  pledges,
  allowPartial,
  allowSelect,
  minPartialAgorot,
}: {
  congregantId: string;
  debtAgorot: number;
  pledges: { id: string; label: string; outstanding: number }[];
  allowPartial: boolean;
  allowSelect: boolean;
  minPartialAgorot: number;
}) {
  // Only the payment options the synagogue enabled are offered.
  const modes = (["full", "partial", "select"] as const).filter((m) => m === "full" || (m === "partial" ? allowPartial : allowSelect && pledges.length > 1));
  const [mode, setMode] = useState<"full" | "partial" | "select">("full");
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per payment intention: double clicks and retries return the same payment page.
  const [key] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  const selectedTotal = pledges.filter((p) => selected.includes(p.id)).reduce((s, p) => s + p.outstanding, 0);
  return (
    <Card title="תשלום מאובטח" icon={Lock}>
      <div className="space-y-3">
        {modes.length > 1 && (
        <div className={`grid gap-1 rounded-xl bg-slate-100 p-1 text-sm ${modes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`} role="radiogroup" aria-label="אופן תשלום">
          {modes.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`min-h-10 rounded-lg font-medium transition ${mode === m ? "bg-white text-brand-800 shadow-sm" : "text-slate-600"}`}>
              {m === "full" ? "הכול" : m === "partial" ? "סכום חלקי" : "בחירת נדרים"}
            </button>
          ))}
        </div>
        )}
        {mode === "full" && (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-slate-600">לתשלום</span>
            <Money agorot={debtAgorot} className="text-xl font-bold" />
          </div>
        )}
        {mode === "partial" && <Field label="סכום לתשלום (₪)" hint={minPartialAgorot > 0 ? `מינימום ${minPartialAgorot / 100} ₪` : undefined}><Input inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
        {mode === "select" && (
          <fieldset className="space-y-2">
            {pledges.map((p) => (
              <label key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                <span className="flex items-center gap-2">
                  <input type="checkbox" className="size-5" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                  {p.label}
                </span>
                <Money agorot={p.outstanding} />
              </label>
            ))}
            <p className="text-sm">סה״כ: <Money agorot={selectedTotal} /></p>
          </fieldset>
        )}
        <Button
          className="w-full"
          size="lg"
          disabled={busy || (mode === "partial" && !amount) || (mode === "select" && selected.length === 0)}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const r = await payAction({ congregantId, idempotencyKey: key, amount: mode === "partial" ? amount : undefined, pledgeIds: mode === "select" ? selected : undefined }).catch(() => NET);
            if (!r.ok) {
              setBusy(false);
              return setErr(r.error);
            }
            window.location.assign(r.data!.paymentUrl);
          }}
        >
          {busy ? "מעביר לדף התשלום…" : "מעבר לתשלום"}
        </Button>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          פרטי הכרטיס מוזנים בדף המאובטח של חברת הסליקה בלבד. החוב מתעדכן רק לאחר אישור החיוב מחברת הסליקה.
        </p>
        {err && <Alert tone="error">{err}</Alert>}
      </div>
    </Card>
  );
}

export function ReportPanel({ congregantId }: { congregantId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [opId, setOpId] = useState(() => crypto.randomUUID());
  if (!open)
    return (
      <Button variant="secondary" className="w-full justify-start" onClick={() => setOpen(true)}>
        <ReceiptText className="size-5 text-brand-600" aria-hidden />
        שילמתי בדרך אחרת
      </Button>
    );
  return (
    <Card title="דיווח על תשלום במזומן / העברה / צ׳ק" icon={ReceiptText}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await reportPaidAction({ congregantId, amount: String(f.get("amount")), method: f.get("method") as "cash", reference: String(f.get("reference") || ""), note: String(f.get("note") || ""), clientOpId: opId }).catch(() => NET);
          setMsg(r.ok ? { ok: true, text: r.message! } : { ok: false, text: r.error });
          if (r.ok) {
            setOpId(crypto.randomUUID());
            router.refresh();
          }
        }}
      >
        <Field label="סכום (₪)"><Input name="amount" inputMode="decimal" dir="ltr" required /></Field>
        <Field label="אמצעי"><Select name="method"><option value="cash">מזומן</option><option value="transfer">העברה בנקאית</option><option value="check">צ׳ק</option></Select></Field>
        <Field label="אסמכתה / מספר צ׳ק"><Input name="reference" dir="ltr" /></Field>
        <Field label="הערה"><Input name="note" /></Field>
        <Button className="w-full">שליחת דיווח</Button>
        {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      </form>
    </Card>
  );
}

export function InquiryPanel({ congregantId }: { congregantId: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open)
    return (
      <Button variant="secondary" className="w-full justify-start" onClick={() => setOpen(true)}>
        <HelpCircle className="size-5 text-brand-600" aria-hidden />
        בירור על החוב
      </Button>
    );
  return (
    <Card title="בירור חוב" icon={HelpCircle}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await inquiryAction(congregantId, String(new FormData(e.currentTarget).get("text"))).catch(() => NET);
          setMsg(r.ok ? { ok: true, text: r.message! } : { ok: false, text: r.error });
        }}
      >
        <Field label="מה לא ברור?"><Textarea name="text" required maxLength={1000} /></Field>
        <Button className="w-full">שליחה לגבאי</Button>
        {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      </form>
    </Card>
  );
}

export function OptOutButton({ congregantId }: { congregantId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        className="w-full"
        onClick={async () => {
          if (!confirm("להפסיק לקבל תזכורות?")) return;
          const r = await optOutAction(congregantId).catch(() => NET);
          setMsg(r.ok ? r.message! : r.error);
          router.refresh();
        }}
      >
        הפסקת תזכורות
      </Button>
      {msg && <Alert>{msg}</Alert>}
    </div>
  );
}

export function SwitchSynagogue({ current, others }: { current: string; others: { tenantId: string; name: string }[] }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-sm shadow-card">
      <p className="mb-2">מוצג: <b>{current}</b>. יש לך כרטיס גם ב:</p>
      <div className="flex flex-wrap gap-2">
        {others.map((o) => (
          <Button
            key={o.tenantId}
            variant="secondary"
            className="min-h-9 text-sm"
            onClick={async () => {
              const r = await switchSynagogueAction(o.tenantId).catch(() => NET);
              if (!r.ok) return setErr(r.error);
              window.location.replace(`/me?t=${o.tenantId}`);
            }}
          >
            {o.name}
          </Button>
        ))}
      </div>
      {err && <Alert tone="error">{err}</Alert>}
    </div>
  );
}

export function MeSignOut({ account }: { account: boolean }) {
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await logoutAction().catch(() => undefined);
        if (account) await authClient.signOut().catch(() => undefined);
        window.location.replace(account ? "/login" : "/");
      }}
    >
      יציאה
    </Button>
  );
}
