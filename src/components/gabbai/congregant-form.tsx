"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveCongregantAction } from "@/app/(gabbai)/actions";
import { Alert, Button, Card, Field, Input, Textarea } from "../ui";

export function CongregantForm({ initial }: { initial?: { id: string; firstName: string; lastName: string; phone: string; email: string; notes: string } }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          const r = await saveCongregantAction(initial?.id ?? null, {
            firstName: String(f.get("firstName") ?? ""),
            lastName: String(f.get("lastName") ?? ""),
            phone: String(f.get("phone") ?? ""),
            email: String(f.get("email") ?? ""),
            notes: String(f.get("notes") ?? ""),
          }).catch(() => ({ ok: false as const, error: "אין חיבור לשרת. הנתונים לא נשמרו – נסו שוב." }));
          setBusy(false);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: r.message ?? "נשמר" });
          if (!initial && r.data) router.push(`/congregants/${r.data.id}`);
          else router.refresh();
        }}
      >
        <Field label="שם פרטי *">
          <Input name="firstName" required defaultValue={initial?.firstName} autoComplete="off" />
        </Field>
        <Field label="שם משפחה">
          <Input name="lastName" defaultValue={initial?.lastName} autoComplete="off" />
        </Field>
        <Field label="טלפון נייד" hint="נדרש לשליחת הודעות ולעמוד האישי. ההסכמה להודעות נרשמת בנפרד.">
          <Input name="phone" type="tel" inputMode="tel" dir="ltr" defaultValue={initial?.phone} />
        </Field>
        <Field label="דוא״ל">
          <Input name="email" type="email" dir="ltr" defaultValue={initial?.email} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="הערה פנימית">
            <Textarea name="notes" defaultValue={initial?.notes} />
          </Field>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
          {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
        </div>
      </form>
    </Card>
  );
}
