"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { decidePaymentAction, resolveTaskAction } from "@/app/(gabbai)/actions";
import { Alert, Button, Input } from "../ui";

export function PaymentDecision({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const act = async (approve: boolean) => {
    setBusy(true);
    const r = await decidePaymentAction(paymentId, approve, reason).catch(() => ({ ok: false as const, error: "אין חיבור לשרת. נסו שוב." }));
    setBusy(false);
    if (!r.ok) setErr(r.error);
    else router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={busy} onClick={() => act(true)}>אישור – הכסף התקבל</Button>
      <Input className="w-48" placeholder="סיבת דחייה" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="סיבת דחייה" />
      <Button variant="secondary" disabled={busy} onClick={() => act(false)}>דחייה</Button>
      {err && <Alert tone="error">{err}</Alert>}
    </div>
  );
}

export function ResolveTask({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await resolveTaskAction(taskId, text).catch(() => ({ ok: false as const, error: "אין חיבור לשרת. נסו שוב." }));
        if (!r.ok) setErr(r.error);
        else router.refresh();
      }}
    >
      <Input className="w-64" placeholder="במה הסתיים הטיפול?" value={text} onChange={(e) => setText(e.target.value)} aria-label="סיכום טיפול" required />
      <Button variant="secondary">סימון כמטופל</Button>
      {err && <Alert tone="error">{err}</Alert>}
    </form>
  );
}
