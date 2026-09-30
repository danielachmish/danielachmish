"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { importCommitAction, importPreviewAction } from "@/app/(gabbai)/actions";
import type { ColumnMap, RowResult } from "@/server/gabbai/import-export";
import { Alert, Button, Card, Field, Select } from "../ui";

const FIELDS: [keyof ColumnMap, string, boolean][] = [
  ["firstName", "שם פרטי", true],
  ["lastName", "שם משפחה", true],
  ["phone", "טלפון", false],
  ["externalRef", "מזהה חיצוני", false],
  ["openingBalance", "יתרת פתיחה", false],
  ["date", "תאריך יתרה", false],
];

export function ImportWizard() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Partial<ColumnMap>>({});
  const [preview, setPreview] = useState<{ results: RowResult[]; validCount: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <Card title="1. בחירת קובץ">
        <input
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            setCsv(text);
            setPreview(null);
            const first = text.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
            setHeaders(first.split(",").map((h) => h.replace(/^"|"$/g, "").trim()));
          }}
        />
      </Card>
      {headers.length > 0 && (
        <Card title="2. מיפוי עמודות">
          <div className="grid gap-3 sm:grid-cols-3">
            {FIELDS.map(([k, label, req]) => (
              <Field key={k} label={`${label}${req ? " *" : ""}`}>
                <Select value={map[k] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                  <option value="">—</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `עמודה ${i + 1}`}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          <Button
            className="mt-3"
            disabled={busy || map.firstName === undefined || map.lastName === undefined}
            onClick={async () => {
              setBusy(true);
              const r = await importPreviewAction(csv, map as ColumnMap).catch(() => ({ ok: false as const, error: "אין חיבור לשרת." }));
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
              <thead><tr className="text-right text-slate-500"><th className="p-1">שורה</th><th className="p-1">שם</th><th className="p-1">טלפון</th><th className="p-1">יתרה</th><th className="p-1">מצב</th></tr></thead>
              <tbody>
                {preview.results.map((r) => (
                  <tr key={r.row} className={r.ok ? "" : "bg-red-50"}>
                    <td className="p-1 num">{r.row}</td>
                    <td className="p-1">{r.data?.firstName} {r.data?.lastName}</td>
                    <td className="p-1 num">{r.data?.phone}</td>
                    <td className="p-1 num">{r.data?.openingBalanceAgorot ? Number(r.data.openingBalanceAgorot) / 100 : ""}</td>
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
              const r = await importCommitAction(csv, map as ColumnMap).catch(() => ({ ok: false as const, error: "אין חיבור לשרת. ייתכן שהייבוא לא הושלם – בדקו את רשימת המתפללים לפני ניסיון נוסף." }));
              setBusy(false);
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setMsg({ ok: true, text: `יובאו ${r.data!.imported} מתפללים.` });
              router.refresh();
            }}
          >
            ייבוא
          </Button>
          {preview.validCount !== preview.results.length && <p className="mt-2 text-sm text-red-700">יש לתקן את השורות המסומנות בקובץ ולטעון מחדש.</p>}
        </Card>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}
