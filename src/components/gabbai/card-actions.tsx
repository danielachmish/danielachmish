"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addPledgeAction,
  adjustPledgeAction,
  consentAction,
  familyAccessAction,
  inviteToAppAction,
  issueLinkAction,
  recordExternalPaymentAction,
  revokeAppAccountAction,
  revokeLinksAction,
} from "@/app/(gabbai)/actions";
import type { ActionResult } from "@/server/actions/result";
import { Alert, Button, Field, Input, Select } from "../ui";

const newOpId = () => crypto.randomUUID();
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
const NET_ERR = { ok: false as const, error: "אין חיבור לשרת. הפעולה לא נשמרה – נסו שוב." };

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit<T>(fn: () => Promise<ActionResult<T>>, onOk?: (r: ActionResult<T> & { ok: true }) => void) {
    setBusy(true);
    setMsg(null);
    const r = await fn().catch(() => NET_ERR);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.message ?? "נשמר" });
    onOk?.(r);
    router.refresh();
  }
  const note = msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>;
  return { busy, submit, note };
}

export function AddPledgeForm({ congregantId }: { congregantId: string }) {
  const { busy, submit, note } = useSubmit();
  // One op id per intended pledge: a double click or a retry after a timeout reuses it; after success a new one is issued.
  const [opId, setOpId] = useState(newOpId);
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        submit(
          () =>
            addPledgeAction({
              congregantId,
              clientOpId: opId,
              amount: String(f.get("amount")),
              date: String(f.get("date")),
              dueDate: String(f.get("dueDate") || ""),
              category: String(f.get("category") || ""),
              description: String(f.get("description") || ""),
              internalNote: String(f.get("internalNote") || ""),
              kind: f.get("kind") === "opening_balance" ? "opening_balance" : "pledge",
            }),
          () => {
            setOpId(newOpId());
            form.reset();
          },
        );
      }}
    >
      <Field label="סכום (₪) *">
        <Input name="amount" inputMode="decimal" required dir="ltr" autoComplete="off" />
      </Field>
      <Field label="תאריך *">
        <Input name="date" type="date" required defaultValue={today()} />
      </Field>
      <Field label="סוג רישום">
        <Select name="kind" defaultValue="pledge">
          <option value="pledge">נדר</option>
          <option value="opening_balance">יתרת פתיחה</option>
        </Select>
      </Field>
      <Field label="מועד לתשלום">
        <Input name="dueDate" type="date" />
      </Field>
      <Field label="סוג / עלייה">
        <Input name="category" />
      </Field>
      <Field label="תיאור">
        <Input name="description" />
      </Field>
      <div className="sm:col-span-3">
        <Field label="הערה פנימית">
          <Input name="internalNote" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button disabled={busy}>{busy ? "שומר…" : "רישום נדר"}</Button>
        {note}
      </div>
    </form>
  );
}

export function AdjustPledgeForm({ pledgeId, congregantId, paidAgorot }: { pledgeId: string; congregantId: string; paidAgorot: number }) {
  const { busy, submit, note } = useSubmit();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button variant="ghost" className="min-h-9 px-2 text-sm" onClick={() => setOpen(true)}>
        תיקון
      </Button>
    );
  return (
    <form
      className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit(
          () =>
            adjustPledgeAction({
              pledgeId,
              congregantId,
              direction: f.get("direction") === "increase" ? "increase" : "decrease",
              amount: String(f.get("amount")),
              reason: String(f.get("reason")),
              releaseToCredit: f.get("release") === "on",
            }),
          () => setOpen(false),
        );
      }}
    >
      <Field label="כיוון">
        <Select name="direction">
          <option value="decrease">הפחתה / ביטול</option>
          <option value="increase">הגדלה</option>
        </Select>
      </Field>
      <Field label="סכום התיקון (₪)">
        <Input name="amount" inputMode="decimal" required dir="ltr" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="סיבה (חובה)">
          <Input name="reason" required />
        </Field>
      </div>
      {paidAgorot > 0 && (
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="release" className="mt-1 size-5" />
          <span>על הנדר כבר שולם כסף. אם ההפחתה יורדת מתחת לסכום ששולם – להעביר את העודף לזכות המתפלל.</span>
        </label>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button disabled={busy}>שמירת תיקון</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
      {note}
    </form>
  );
}

export function ExternalPaymentForm({ congregantId }: { congregantId: string }) {
  const { busy, submit, note } = useSubmit();
  const [opId, setOpId] = useState(newOpId);
  const [method, setMethod] = useState("cash");
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        submit(
          () =>
            recordExternalPaymentAction({
              congregantId,
              clientOpId: opId,
              amount: String(f.get("amount")),
              method: method as "cash",
              reference: String(f.get("reference") || ""),
              note: String(f.get("note") || ""),
              received: f.get("received") === "on",
            }),
          () => {
            setOpId(newOpId());
            form.reset();
          },
        );
      }}
    >
      <Field label="סכום (₪) *">
        <Input name="amount" inputMode="decimal" required dir="ltr" />
      </Field>
      <Field label="אמצעי">
        <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">מזומן</option>
          <option value="transfer">העברה בנקאית</option>
          <option value="check">צ׳ק</option>
        </Select>
      </Field>
      <Field label={method === "check" ? "מספר צ׳ק" : "אסמכתה"}>
        <Input name="reference" dir="ltr" />
      </Field>
      <Field label="הערה">
        <Input name="note" />
      </Field>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="received" className="mt-1 size-5" defaultChecked={method !== "check"} key={method} />
        <span>הכסף התקבל בפועל (צ׳ק שטרם נפרע – להשאיר לא מסומן; החוב יירד רק לאחר אישור)</span>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button disabled={busy}>רישום תשלום</Button>
        {note}
      </div>
    </form>
  );
}

export function ConsentButtons({ congregantId, granted, hasPhone }: { congregantId: string; granted: boolean; hasPhone: boolean }) {
  const { busy, submit, note } = useSubmit();
  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={busy || !hasPhone} onClick={() => submit(() => consentAction(congregantId, !granted))}>
        {granted ? "ביטול הסכמה להודעות" : "רישום הסכמה להודעות וואטסאפ"}
      </Button>
      {!hasPhone && <p className="text-sm text-slate-500">כדי לרשום הסכמה יש להזין טלפון.</p>}
      {note}
    </div>
  );
}

export function FamilyAccessForm({ congregantId }: { congregantId: string }) {
  const { busy, submit, note } = useSubmit();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const phone = String(new FormData(e.currentTarget).get("phone"));
        submit(() => familyAccessAction(congregantId, phone));
      }}
    >
      <Field label="טלפון של בן משפחה מורשה">
        <Input name="phone" type="tel" dir="ltr" required />
      </Field>
      <Button variant="secondary" disabled={busy}>
        הוספת הרשאה
      </Button>
      {note}
    </form>
  );
}

export function PersonalLinkButtons({ congregantId }: { congregantId: string }) {
  const { busy, submit, note } = useSubmit();
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => submit(() => issueLinkAction(congregantId), (r) => setUrl(r.data?.url ?? null))}>
          יצירת קישור אישי
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => submit(() => revokeLinksAction(congregantId), () => setUrl(null))}>
          ביטול כל הקישורים
        </Button>
      </div>
      {url && (
        <div className="space-y-1">
          <Input readOnly value={url} dir="ltr" onFocus={(e) => e.currentTarget.select()} aria-label="קישור אישי" />
          <p className="text-xs text-slate-500">הקישור תקף 30 יום. הצגת הפרטים מחייבת קוד שנשלח לטלפון של הכרטיס.</p>
        </div>
      )}
      {note}
    </div>
  );
}

/** Invite the congregant to open an app account (e-mail + password) linked to this card. */
export function AppInviteButtons({ congregantId, phone, hasEmail }: { congregantId: string; phone: string | null; hasEmail: boolean }) {
  const { busy, submit, note } = useSubmit();
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {phone && (
          <Button
            className="bg-[#1f8f4e] hover:bg-[#187540]"
            disabled={busy}
            onClick={async () => {
              // Open the tab synchronously (popup blockers), then point it at wa.me once the invitation exists.
              const w = window.open("", "_blank");
              let opened = false;
              await submit(
                () => inviteToAppAction(congregantId, "link"),
                (r) => {
                  opened = true;
                  setUrl(r.data?.url ?? null);
                  const wa = `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(r.data?.text ?? "")}`;
                  if (w) w.location.href = wa;
                  else window.location.href = wa;
                },
              );
              if (!opened) w?.close();
            }}
          >
            הזמנה לאפליקציה בוואטסאפ
          </Button>
        )}
        {hasEmail && (
          <Button variant="secondary" disabled={busy} onClick={() => submit(() => inviteToAppAction(congregantId, "email"), (r) => setUrl(r.data?.url ?? null))}>
            הזמנה בדוא״ל
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => submit(() => inviteToAppAction(congregantId, "link"), (r) => setUrl(r.data?.url ?? null))}>
          קישור הזמנה להעתקה
        </Button>
      </div>
      {url && (
        <div className="space-y-1">
          <Input readOnly value={url} dir="ltr" onFocus={(e) => e.currentTarget.select()} aria-label="קישור הזמנה" />
          <p className="text-xs text-slate-500">הקישור חד-פעמי ובתוקף 14 יום. הזמנה חדשה מבטלת את הקודמת.</p>
        </div>
      )}
      {note}
    </div>
  );
}

export function RevokeAccountButton({ accountId }: { accountId: string }) {
  const { busy, submit, note } = useSubmit();
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="ghost" className="min-h-8 text-sm" disabled={busy} onClick={() => confirm("לנתק את החשבון מהכרטיס? המתפלל לא יראה עוד את הנתונים.") && submit(() => revokeAppAccountAction(accountId))}>
        ניתוק
      </Button>
      {note}
    </span>
  );
}
