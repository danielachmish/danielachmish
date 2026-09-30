"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { inquiryAction, optOutAction, payAction, reportPaidAction } from "./actions";
import { Alert, Button, Card, Field, Input, Money, Select, Textarea } from "@/components/ui";

const NET = { ok: false as const, error: "אין חיבור לשרת. נסו שוב." };

export function PayPanel({ congregantId, debtAgorot, pledges }: { congregantId: string; debtAgorot: number; pledges: { id: string; label: string; outstanding: number }[] }) {
  const [mode, setMode] = useState<"full" | "partial" | "select">("full");
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per payment intention: double clicks and retries return the same payment page.
  const [key] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  const selectedTotal = pledges.filter((p) => selected.includes(p.id)).reduce((s, p) => s + p.outstanding, 0);
  return (
    <Card title="תשלום מאובטח">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="radiogroup" aria-label="אופן תשלום">
          {(["full", "partial", "select"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`min-h-10 rounded-md ${mode === m ? "bg-white shadow" : ""}`}>
              {m === "full" ? "הכול" : m === "partial" ? "סכום חלקי" : "בחירת נדרים"}
            </button>
          ))}
        </div>
        {mode === "full" && <p>לתשלום: <Money agorot={debtAgorot} className="font-bold" /></p>}
        {mode === "partial" && <Field label="סכום לתשלום (₪)"><Input inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
        {mode === "select" && (
          <fieldset className="space-y-2">
            {pledges.map((p) => (
              <label key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
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
        <p className="text-xs text-slate-500">פרטי הכרטיס מוזנים בדף המאובטח של חברת הסליקה בלבד. החוב מתעדכן רק לאחר אישור החיוב מחברת הסליקה.</p>
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
  if (!open) return <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>שילמתי בדרך אחרת</Button>;
  return (
    <Card title="דיווח על תשלום במזומן / העברה / צ׳ק">
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
  if (!open) return <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>בירור על החוב</Button>;
  return (
    <Card title="בירור חוב">
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
