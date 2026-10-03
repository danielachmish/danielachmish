"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { manualPaymentAction, replaceGabbaiAction, resolveCaseAction, saveLoginSettingsAction, subscriptionStatusAction } from "./actions";
import type { CodeChannel, LoginSettings } from "@/server/auth/login-settings";
import type { ActionResult } from "@/server/actions/result";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

function useAct() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = async (fn: () => Promise<ActionResult<unknown>>) => {
    const r = await fn().catch(() => ({ ok: false as const, error: "אין חיבור לשרת." }));
    setMsg(r.ok ? { ok: true, text: r.message ?? "בוצע" } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  };
  return { act, note: msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert> };
}

export function SubscriptionControls({ tenantId, status }: { tenantId: string; status: string }) {
  const { act, note } = useAct();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-48"><Select defaultValue="" aria-label="שינוי מצב מנוי" onChange={(e) => e.target.value && act(() => subscriptionStatusAction(tenantId, e.target.value as "active"))}>
        <option value="">שינוי מצב מנוי…</option>
        {["active", "past_due", "grace", "suspended", "cancelled"].filter((s) => s !== status).map((s) => <option key={s} value={s}>{s}</option>)}
      </Select></div>
      {note}
    </div>
  );
}

export function ManualPaymentForm({ tenantId, invoiceId }: { tenantId: string; invoiceId: string }) {
  const { act, note } = useAct();
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); act(() => manualPaymentAction(tenantId, invoiceId, String(new FormData(e.currentTarget).get("ref")))); }}>
      <Input name="ref" className="w-40" placeholder="אסמכתה" required aria-label="אסמכתה" />
      <Button variant="secondary">רישום תשלום ידני</Button>
      {note}
    </form>
  );
}

export function ReplaceGabbaiForm({ tenantId }: { tenantId: string }) {
  const { act, note } = useAct();
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); act(() => replaceGabbaiAction(tenantId, String(f.get("email")), String(f.get("name")), String(f.get("reason")))); }}>
      <Field label="שם הגבאי החדש"><Input name="name" required /></Field>
      <Field label="דוא״ל"><Input name="email" type="email" dir="ltr" required /></Field>
      <Field label="סיבה ותיעוד"><Input name="reason" required /></Field>
      <div className="flex items-center gap-3 sm:col-span-3"><Button variant="danger">החלפת גבאי ראשי</Button>{note}</div>
    </form>
  );
}

export function ResolveCase({ id }: { id: string }) {
  const { act } = useAct();
  return <Button variant="ghost" className="min-h-8 text-sm" onClick={() => act(() => resolveCaseAction(id))}>סגירה</Button>;
}

export function LoginSettingsForm({ initial, channels, envChannel }: { initial: LoginSettings; channels: { value: CodeChannel; label: string; ready: boolean; note?: string }[]; envChannel: string }) {
  const { act, note } = useAct();
  const [phoneLogin, setPhoneLogin] = useState(initial.phoneLogin);
  const [channel, setChannel] = useState<string>(initial.codeChannel ?? "");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => saveLoginSettingsAction({ phoneLogin, codeChannel: (channel || null) as CodeChannel | null }));
      }}
    >
      <p className="text-sm text-slate-600">כניסה עם דוא״ל וסיסמה פעילה תמיד – לגבאים, למתפללים שהוזמנו ולך.</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="size-5" checked={phoneLogin} onChange={(e) => setPhoneLogin(e.target.checked)} />
        <span>כניסת מתפללים עם מספר טלפון וקוד (כשכבוי – הכפתור מוסתר והכניסה חסומה)</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">לאן נשלח הקוד (כניסה בטלפון וקישורים אישיים)</span>
        <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">לפי הגדרות השרת ({envChannel})</option>
          {channels.map((c) => (
            <option key={c.value} value={c.value} disabled={!c.ready}>
              {c.label}{c.ready ? "" : " – לא מוגדר"}
            </option>
          ))}
        </Select>
      </label>
      <ul className="list-disc space-y-1 ps-5 text-xs text-slate-500">
        {channels.filter((c) => c.note).map((c) => <li key={c.value}>{c.label}: {c.note}</li>)}
      </ul>
      <div className="flex items-center gap-3"><Button>שמירה</Button>{note}</div>
    </form>
  );
}
