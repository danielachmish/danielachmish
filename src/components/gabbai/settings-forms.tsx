"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeSupportGrantAction, supportGrantAction, updateGeneralSettingsAction } from "@/app/(gabbai)/actions";
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

export function GeneralSettings({ name }: { name: string }) {
  const { act, busy, note } = useAct();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateGeneralSettingsAction({ name: String(new FormData(e.currentTarget).get("name")) }));
      }}
    >
      <Field label="שם בית הכנסת"><Input name="name" defaultValue={name} required /></Field>
      <Button disabled={busy}>שמירה</Button>
      {note}
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
