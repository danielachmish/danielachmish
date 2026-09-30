"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyCreditAction, bulkReminderPreviewAction, bulkReminderSendAction, cancelReminderAction, sendReminderNowAction } from "@/app/(gabbai)/actions";
import { Alert, Button } from "../ui";

const NET = { ok: false as const, error: "אין חיבור לשרת. נסו שוב." };

/** "Send reminder now" on a card. Soft blocks ask for explicit confirmation; hard blocks are explained. */
export function SendReminderNow({ congregantId }: { congregantId: string }) {
  const router = useRouter();
  const [opId, setOpId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async (override: boolean) => {
    setBusy(true);
    setMsg(null);
    const r = await sendReminderNowAction(congregantId, override, opId).catch(() => NET);
    setBusy(false);
    if (r.ok) {
      setConfirm(null);
      setMsg({ ok: true, text: r.message ?? "נשלח" });
      setOpId(crypto.randomUUID());
      router.refresh();
    } else if (r.error.startsWith("שימו לב")) setConfirm(r.error);
    else setMsg({ ok: false, text: r.error });
  };
  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={busy} onClick={() => send(false)}>
        {busy ? "שולח…" : "שליחת תזכורת עכשיו"}
      </Button>
      {confirm && (
        <Alert tone="warn">
          <p className="mb-2">{confirm}</p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => send(true)}>לשלוח בכל זאת</Button>
            <Button variant="secondary" onClick={() => setConfirm(null)}>ביטול</Button>
          </div>
        </Alert>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}

export function ApplyCreditButton({ congregantId }: { congregantId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        onClick={async () => {
          const r = await applyCreditAction(congregantId).catch(() => NET);
          setMsg(r.ok ? { ok: true, text: r.message! } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        }}
      >
        החלת הזכות על נדרים פתוחים
      </Button>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}

const REASON: Record<string, string> = {
  no_phone: "ללא טלפון",
  no_consent: "ללא הסכמה",
  opted_out: "ביקשו להפסיק",
  open_inquiry_or_report: "בירור/דיווח פתוח",
  pending_external_payment: "תשלום ממתין לאישור",
  open_payment_request: "פתחו דף תשלום לאחרונה",
  recent_reminder: "קיבלו תזכורת ב-24 שעות",
  messaging_not_connected: "וואטסאפ לא מחובר",
  quota_exhausted: "המכסה נוצלה",
  subscription_inactive: "המנוי אינו פעיל",
};

/** Bulk: preview first (who will get it, who will not and why), then an explicit confirmation. */
export function BulkReminder() {
  const router = useRouter();
  const [preview, setPreview] = useState<{ eligible: number; skipped: Record<string, number> } | null>(null);
  const [opId, setOpId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-3">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await bulkReminderPreviewAction().catch(() => NET);
          setBusy(false);
          if (r.ok) setPreview(r.data!);
          else setMsg({ ok: false, text: r.error });
        }}
      >
        שליחת תזכורת לכל בעלי החוב…
      </Button>
      {preview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium">יישלחו עכשיו: <span className="num">{preview.eligible}</span> מתפללים.</p>
          {Object.keys(preview.skipped).length > 0 && (
            <ul className="mt-1 text-slate-600">
              {Object.entries(preview.skipped).map(([k, n]) => (
                <li key={k}>לא יישלח – {REASON[k] ?? k}: <span className="num">{n}</span></li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              disabled={busy || preview.eligible === 0}
              onClick={async () => {
                setBusy(true);
                const r = await bulkReminderSendAction(opId).catch(() => NET);
                setBusy(false);
                setPreview(null);
                setOpId(crypto.randomUUID());
                setMsg(r.ok ? { ok: true, text: `${r.data!.queued} תזכורות נכנסו לשליחה ויישלחו בדקה הקרובה.` } : { ok: false, text: r.error });
                router.refresh();
              }}
            >
              אישור ושליחה
            </Button>
            <Button variant="secondary" onClick={() => setPreview(null)}>ביטול</Button>
          </div>
        </div>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}

export function CancelReminder({ id }: { id: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="ghost"
        className="min-h-8 px-2 text-sm"
        onClick={async () => {
          const r = await cancelReminderAction(id).catch(() => NET);
          if (!r.ok) setErr(r.error);
          router.refresh();
        }}
      >
        ביטול
      </Button>
      {err && <span className="text-sm text-red-700">{err}</span>}
    </>
  );
}
