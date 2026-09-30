"use client";
import { useEffect, useMemo, useState } from "react";
import { batchPledgesAction } from "@/app/(gabbai)/actions";
import { Alert, Button, Field, Input } from "../ui";

type Row = { key: string; person: string; personId: string; amount: string; category: string; description: string; dueDate: string; internalNote: string; status?: "saved" | "error"; error?: string };
const blank = (): Row => ({ key: crypto.randomUUID(), person: "", personId: "", amount: "", category: "", description: "", dueDate: "", internalNote: "" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

export function BatchEntry({ people, draftKey }: { people: { id: string; name: string }[]; draftKey: string }) {
  // Rendered client-only (batch-client.tsx): the device-local draft is read during initialisation.
  const [draft] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(draftKey) ?? "null") as { date: string; rows: Row[] } | null;
    } catch {
      return null;
    }
  });
  const [date, setDate] = useState(() => draft?.date ?? today());
  const [rows, setRows] = useState<Row[]>(() => (draft?.rows?.length ? draft.rows : [blank()]));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [extra, setExtra] = useState(false);
  const byName = useMemo(() => new Map(people.map((p) => [p.name, p.id])), [people]);

  // Local draft (per device). Not a database record until saved.
  useEffect(() => {
    try {
      const pending = rows.filter((r) => r.status !== "saved" && (r.person || r.amount));
      if (pending.length) localStorage.setItem(draftKey, JSON.stringify({ date, rows }));
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [rows, date, draftKey]);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, status: undefined, error: undefined } : r)));

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("[data-batch]"));
    const i = inputs.indexOf(e.currentTarget);
    if (i === inputs.length - 1) {
      setRows((rs) => [...rs, blank()]);
      setTimeout(() => document.querySelectorAll<HTMLInputElement>("[data-batch]")[i + 1]?.focus(), 0);
    } else inputs[i + 1]?.focus();
  }

  async function save() {
    const toSave = rows.filter((r) => r.status !== "saved" && (r.person || r.amount));
    const invalid = toSave.filter((r) => !r.personId || !r.amount);
    if (invalid.length) {
      setRows((rs) => rs.map((r) => (invalid.includes(r) ? { ...r, status: "error", error: !r.personId ? "יש לבחור מתפלל מהרשימה" : "חסר סכום" } : r)));
      return setMsg({ ok: false, text: "יש שורות חסרות. תקנו ונסו שוב." });
    }
    if (!toSave.length) return setMsg({ ok: false, text: "אין שורות לשמירה." });
    setBusy(true);
    setMsg(null);
    // The row key doubles as the idempotency key: retrying after a network failure never duplicates.
    const r = await batchPledgesAction(
      toSave.map((x) => ({
        congregantId: x.personId,
        amount: x.amount,
        date,
        dueDate: x.dueDate,
        category: x.category,
        description: x.description,
        internalNote: x.internalNote,
        clientOpId: x.key,
      })),
    ).catch(() => null);
    setBusy(false);
    if (!r) return setMsg({ ok: false, text: "אין חיבור לשרת. שום דבר לא סומן כשמור – הטיוטה נשמרה, נסו שוב." });
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    const res = new Map(r.data!.results.map((x) => [x.clientOpId, x]));
    setRows((rs) => rs.map((row) => {
      const x = res.get(row.key);
      return x ? { ...row, status: x.ok ? "saved" : "error", error: x.error } : row;
    }));
    const failed = r.data!.results.filter((x) => !x.ok).length;
    setMsg(failed ? { ok: false, text: `${r.data!.results.length - failed} נשמרו, ${failed} נכשלו – ראו את השורות המסומנות.` } : { ok: true, text: `${r.data!.results.length} נדרים נשמרו.` });
  }

  const saved = rows.filter((r) => r.status === "saved").length;
  return (
    <div className="space-y-3">
      <datalist id="people">
        {people.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <Field label="תאריך משותף">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={extra} onChange={(e) => setExtra(e.target.checked)} /> שדות נוספים
        </label>
      </div>
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={r.key}
            className={`rounded-xl border bg-white p-3 ${r.status === "saved" ? "border-green-300 bg-green-50" : r.status === "error" ? "border-red-300" : "border-slate-200"}`}
          >
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <Input
                data-batch
                list="people"
                aria-label={`מתפלל שורה ${i + 1}`}
                placeholder="מתפלל"
                value={r.person}
                disabled={r.status === "saved"}
                onKeyDown={onEnter}
                onChange={(e) => update(r.key, { person: e.target.value, personId: byName.get(e.target.value) ?? "" })}
              />
              <Input
                data-batch
                inputMode="decimal"
                dir="ltr"
                aria-label={`סכום שורה ${i + 1}`}
                placeholder="₪"
                value={r.amount}
                disabled={r.status === "saved"}
                onKeyDown={onEnter}
                onChange={(e) => update(r.key, { amount: e.target.value })}
              />
            </div>
            {extra && r.status !== "saved" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <Input placeholder="סוג / עלייה" value={r.category} onChange={(e) => update(r.key, { category: e.target.value })} />
                <Input placeholder="תיאור" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} />
                <Input type="date" aria-label="מועד לתשלום" value={r.dueDate} onChange={(e) => update(r.key, { dueDate: e.target.value })} />
                <Input placeholder="הערה פנימית" value={r.internalNote} onChange={(e) => update(r.key, { internalNote: e.target.value })} />
              </div>
            )}
            {r.person && !r.personId && r.status !== "saved" && <p className="mt-1 text-sm text-amber-700">בחרו שם מהרשימה (או הוסיפו מתפלל חדש).</p>}
            {r.status === "saved" && <p className="mt-1 text-sm text-green-700">נשמר</p>}
            {r.error && <p className="mt-1 text-sm text-red-700">{r.error}</p>}
          </li>
        ))}
      </ol>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/95 py-3">
        <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, blank()])}>
          שורה נוספת
        </Button>
        <Button type="button" disabled={busy} onClick={save}>
          {busy ? "שומר…" : "שמירת הכול"}
        </Button>
        {saved > 0 && (
          <Button type="button" variant="ghost" onClick={() => setRows((rs) => [...rs.filter((r) => r.status !== "saved"), ...(rs.every((r) => r.status === "saved") ? [blank()] : [])])}>
            ניקוי שורות שנשמרו
          </Button>
        )}
      </div>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}
