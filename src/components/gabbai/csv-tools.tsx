"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pledgeImportCommitAction, pledgeImportPreviewAction, reconcileReportAction } from "@/app/(gabbai)/actions";
import type { PledgeColumnMap, ReconColumnMap, RowResult } from "@/server/gabbai/import-export";
import { Alert, Button, Card, Field, Select } from "../ui";

function useCsvFile() {
  const [csv, setCsv] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const input = (
    <input
      type="file"
      accept=".csv,text/csv"
      className="block w-full text-sm"
      aria-label="בחירת קובץ CSV"
      onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const text = await f.text();
        setCsv(text);
        const first = text.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
        setHeaders(first.split(",").map((h) => h.replace(/^"|"$/g, "").trim()));
      }}
    />
  );
  return { csv, headers, input };
}

function ColumnSelect({ label, headers, value, onChange, required }: { label: string; headers: string[]; value?: number; onChange: (v?: number) => void; required?: boolean }) {
  return (
    <Field label={`${label}${required ? " *" : ""}`}>
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}>
        <option value="">—</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>{h || `עמודה ${i + 1}`}</option>
        ))}
      </Select>
    </Field>
  );
}

const NET = { ok: false as const, error: "אין חיבור לשרת." };

export function PledgeImport() {
  const router = useRouter();
  const { csv, headers, input } = useCsvFile();
  const [map, setMap] = useState<Partial<PledgeColumnMap>>({});
  const [preview, setPreview] = useState<{ results: RowResult[]; validCount: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof PledgeColumnMap) => (v?: number) => setMap((m) => ({ ...m, [k]: v }));
  const ready = map.match !== undefined && map.amount !== undefined && map.date !== undefined;
  return (
    <div className="space-y-4">
      <Card title="1. קובץ">{input}</Card>
      {headers.length > 0 && (
        <Card title="2. מיפוי עמודות">
          <div className="grid gap-3 sm:grid-cols-3">
            <ColumnSelect label="מזהה מתפלל או טלפון" headers={headers} value={map.match} onChange={set("match")} required />
            <ColumnSelect label="סכום" headers={headers} value={map.amount} onChange={set("amount")} required />
            <ColumnSelect label="תאריך" headers={headers} value={map.date} onChange={set("date")} required />
            <ColumnSelect label="סוג / עלייה" headers={headers} value={map.category} onChange={set("category")} />
            <ColumnSelect label="תיאור" headers={headers} value={map.description} onChange={set("description")} />
            <ColumnSelect label="מועד לתשלום" headers={headers} value={map.dueDate} onChange={set("dueDate")} />
          </div>
          <Button
            className="mt-3"
            disabled={busy || !ready}
            onClick={async () => {
              setBusy(true);
              const r = await pledgeImportPreviewAction(csv, map as PledgeColumnMap).catch(() => NET);
              setBusy(false);
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setPreview(r.data!);
              setMsg(null);
            }}
          >
            תצוגה מקדימה
          </Button>
        </Card>
      )}
      {preview && (
        <Card title={`3. תצוגה מקדימה – ${preview.validCount} מתוך ${preview.results.length} תקינות`}>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-slate-500"><th className="p-1">שורה</th><th className="p-1">מתפלל</th><th className="p-1">סכום</th><th className="p-1">תאריך</th><th className="p-1">מצב</th></tr></thead>
              <tbody>
                {preview.results.map((r) => (
                  <tr key={r.row} className={r.ok ? "" : "bg-red-50"}>
                    <td className="p-1 num">{r.row}</td>
                    <td className="p-1">{r.data?.name ?? "—"}</td>
                    <td className="p-1 num">{r.data?.amountAgorot ? Number(r.data.amountAgorot) / 100 : ""}</td>
                    <td className="p-1 num">{r.data?.date}</td>
                    <td className="p-1">{r.ok ? "תקין" : r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            className="mt-3"
            disabled={busy || preview.validCount !== preview.results.length}
            onClick={async () => {
              setBusy(true);
              const r = await pledgeImportCommitAction(csv, map as PledgeColumnMap).catch(() => ({ ok: false as const, error: "אין חיבור לשרת. בדקו בכרטיסים לפני ניסיון נוסף – ייבוא חוזר של אותו קובץ נחסם." }));
              setBusy(false);
              setMsg(r.ok ? { ok: true, text: `יובאו ${r.data!.imported} נדרים.` } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            }}
          >
            ייבוא
          </Button>
        </Card>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}

export function ReconcileReport() {
  const { csv, headers, input } = useCsvFile();
  const [map, setMap] = useState<Partial<ReconColumnMap>>({});
  const [result, setResult] = useState<{ checked: number; diffs: { row: number; transactionId: string; problem: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ReconColumnMap) => (v?: number) => setMap((m) => ({ ...m, [k]: v }));
  return (
    <div className="space-y-4">
      <Card title="1. דוח עסקאות מחברת הסליקה (CSV)">{input}</Card>
      {headers.length > 0 && (
        <Card title="2. מיפוי עמודות">
          <div className="grid gap-3 sm:grid-cols-2">
            <ColumnSelect label="מזהה עסקה" headers={headers} value={map.transactionId} onChange={set("transactionId")} required />
            <ColumnSelect label="סכום" headers={headers} value={map.amount} onChange={set("amount")} required />
            <ColumnSelect label="סוג פעולה (חיוב / החזר)" headers={headers} value={map.type} onChange={set("type")} />
            <ColumnSelect label="סטטוס" headers={headers} value={map.status} onChange={set("status")} />
          </div>
          <Button
            className="mt-3"
            disabled={busy || map.transactionId === undefined || map.amount === undefined}
            onClick={async () => {
              setBusy(true);
              const r = await reconcileReportAction(csv, map as ReconColumnMap).catch(() => NET);
              setBusy(false);
              if (!r.ok) return setErr(r.error);
              setErr(null);
              setResult(r.data!);
            }}
          >
            השוואה
          </Button>
        </Card>
      )}
      {result && (
        <Card title={`תוצאה: נבדקו ${result.checked} שורות`}>
          {result.diffs.length === 0 ? (
            <Alert tone="success">הכול תואם – כל העסקאות בדוח רשומות במערכת באותו סכום.</Alert>
          ) : (
            <>
              <Alert tone="warn">נמצאו {result.diffs.length} הבדלים. נפתחה משימה במסך המשימות. היתרות לא שונו – רק אירוע מאומת מהספק משנה יתרה.</Alert>
              <ul className="mt-2 text-sm">
                {result.diffs.slice(0, 50).map((d) => (
                  <li key={`${d.row}-${d.transactionId}`}>שורה <span className="num">{d.row}</span> · <span className="num">{d.transactionId}</span> · {d.problem}</li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
      {err && <Alert tone="error">{err}</Alert>}
    </div>
  );
}
