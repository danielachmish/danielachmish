"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { connectIntegrationAction, revokeSupportGrantAction, supportGrantAction, updateSettingsAction } from "@/app/(gabbai)/actions";
import type { ActionResult } from "@/server/actions/result";
import { Alert, Button, Field, Input, Select } from "../ui";

function useAct() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<ActionResult<unknown>>) => {
    setBusy(true);
    const r = await fn().catch(() => ({ ok: false as const, error: "אין חיבור לשרת. נסו שוב." }));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: r.message ?? "נשמר" } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
    return r;
  };
  return { act, busy, note: msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert> };
}

export function GeneralSettings({ name, first, interval }: { name: string; first: number; interval: number }) {
  const { act, busy, note } = useAct();
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        act(() => updateSettingsAction({ name: String(f.get("name")), reminderFirstDelayDays: Number(f.get("first")), reminderIntervalDays: Number(f.get("interval")) }));
      }}
    >
      <Field label="שם בית הכנסת"><Input name="name" defaultValue={name} required /></Field>
      <Field label="תזכורת ראשונה (ימים)"><Input name="first" type="number" inputMode="numeric" min={0} max={120} defaultValue={first} /></Field>
      <Field label="מרווח בין תזכורות (ימים)"><Input name="interval" type="number" inputMode="numeric" min={7} max={365} defaultValue={interval} /></Field>
      <div className="flex items-center gap-3 sm:col-span-3"><Button disabled={busy}>שמירה</Button>{note}</div>
    </form>
  );
}

export function IntegrationForm({ kind, mode, hasActive }: { kind: "payment" | "messaging"; mode: string; hasActive: boolean }) {
  const { act, busy, note } = useAct();
  const provider = mode === "fake" ? "fake" : kind === "payment" ? "payplus" : "whatsapp_cloud";
  const fields: [string, string][] =
    provider === "fake"
      ? kind === "payment" ? [["webhookSecret", "סוד חתימה (דמה)"]] : []
      : provider === "payplus"
        ? [["apiKey", "API key"], ["secretKey", "Secret key"], ["paymentPageUid", "Payment page UID"]]
        : [["accessToken", "Access token"]];
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const secrets: Record<string, string> = {};
        for (const [k] of fields) if (String(f.get(k) ?? "")) secrets[k] = String(f.get(k));
        act(() =>
          connectIntegrationAction({
            kind,
            provider,
            externalAccountId: String(f.get("externalAccountId")),
            displayName: String(f.get("displayName") ?? ""),
            secrets,
            confirmReplace: f.get("confirmReplace") === "on",
          }),
        );
      }}
    >
      <Field label={kind === "payment" ? "מזהה מסוף / חשבון מקבל" : "מזהה מספר וואטסאפ"}>
        <Input name="externalAccountId" dir="ltr" required autoComplete="off" />
      </Field>
      <Field label="שם לתצוגה"><Input name="displayName" /></Field>
      {fields.map(([k, label]) => (
        <Field key={k} label={label}><Input name={k} type="password" dir="ltr" autoComplete="off" required /></Field>
      ))}
      {hasActive && (
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="confirmReplace" className="mt-1 size-5" />
          <span>אני מאשר/ת החלפת החשבון הקיים. עסקאות שכבר התחילו יישארו משויכות לחשבון המקורי.</span>
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button disabled={busy}>{hasActive ? "החלפת חיבור" : "חיבור"}</Button>
        {note}
      </div>
      {mode === "fake" && <p className="text-xs text-slate-500 sm:col-span-2">סביבת פיתוח: חיבור דמה בלבד, ללא כסף אמיתי וללא שליחת הודעות.</p>}
    </form>
  );
}

export function SupportGrantForm({ grants }: { grants: { id: string; scope: string; expiresAt: string; reason: string }[] }) {
  const { act, busy, note } = useAct();
  return (
    <div className="space-y-3">
      {grants.length > 0 && (
        <ul className="space-y-1 text-sm">
          {grants.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-2">
              <span>{g.scope === "read_ledger" ? "צפייה בנתוני כרטיסים" : "צפייה בחיבורים"} עד {new Date(g.expiresAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })} – {g.reason}</span>
              <Button variant="ghost" className="min-h-9 text-sm" onClick={() => act(() => revokeSupportGrantAction(g.id))}>ביטול</Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          act(() => supportGrantAction({ adminEmail: String(f.get("email")), scope: f.get("scope") === "read_integrations" ? "read_integrations" : "read_ledger", hours: Number(f.get("hours")), reason: String(f.get("reason")) }));
        }}
      >
        <Field label="דוא״ל איש התמיכה"><Input name="email" type="email" dir="ltr" required /></Field>
        <Field label="היקף">
          <Select name="scope"><option value="read_integrations">חיבורים בלבד</option><option value="read_ledger">צפייה בכרטיסים</option></Select>
        </Field>
        <Field label="לכמה שעות"><Input name="hours" type="number" min={1} max={72} defaultValue={4} /></Field>
        <Field label="מטרה"><Input name="reason" required /></Field>
        <div className="flex items-center gap-3 sm:col-span-4"><Button variant="secondary" disabled={busy}>מתן גישה זמנית</Button>{note}</div>
      </form>
    </div>
  );
}
