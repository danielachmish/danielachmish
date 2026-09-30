"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { updateBehaviourSettingsAction, updateReminderPolicyAction } from "@/app/(gabbai)/actions";
import type { TenantSettings } from "@/server/settings";
import { Alert, Button, Field, Input, Textarea } from "../ui";

const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const DEFAULT_TEMPLATE = "שלום {שם}, תזכורת מ{בית_כנסת}: היתרה הפתוחה שלך היא {סכום}. לצפייה ולתשלום: {קישור}";

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-slate-500">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="mt-1 size-6 shrink-0 accent-[var(--color-brand-600)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(true);
    const r: { ok: boolean; error?: string; message?: string } = await fn().catch(() => ({ ok: false, error: "אין חיבור לשרת. ההגדרות לא נשמרו." }));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: r.message ?? "נשמר" } : { ok: false, text: r.error ?? "שגיאה" });
    if (r.ok) router.refresh();
  };
  return { busy, save, note: msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert> };
}

export type ReminderPolicy = {
  enabled: boolean;
  firstDelayDays: number;
  intervalDays: number;
  days: number[];
  hour: number;
  minute: number;
  skipHolidays: boolean;
  template: string | null;
};

export function ReminderPolicyForm({
  initial,
  synagogueName,
  save: saveFn = updateReminderPolicyAction,
}: {
  initial: ReminderPolicy;
  synagogueName: string;
  save?: (p: ReminderPolicy) => Promise<{ ok: boolean; error?: string; message?: string }>;
}) {
  const [p, setP] = useState(initial);
  const [custom, setCustom] = useState(!!initial.template);
  const { busy, save, note } = useSave();
  const set = (patch: Partial<ReminderPolicy>) => setP((x) => ({ ...x, ...patch }));
  const text = custom ? p.template ?? "" : DEFAULT_TEMPLATE;
  const preview = useMemo(
    () =>
      text
        .replaceAll("{שם_מלא}", "ישראל ישראלי")
        .replaceAll("{שם}", "ישראל")
        .replaceAll("{סכום}", "180 ₪")
        .replaceAll("{בית_כנסת}", synagogueName)
        .replaceAll("{קישור}", "https://…/p#…") + '\nלהפסקת תזכורות השיבו "הסר".',
    [text, synagogueName],
  );
  const time = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(() => saveFn({ ...p, template: custom ? p.template : null }));
      }}
    >
      <Toggle
        label="שליחת תזכורות אוטומטית"
        hint="כשכבוי – לא נשלחות תזכורות אוטומטיות בכלל. שליחה ידנית נשארת זמינה בכרטיס ובמסך התזכורות."
        checked={p.enabled}
        onChange={(v) => set({ enabled: v })}
      />
      <fieldset disabled={!p.enabled} className="space-y-4 disabled:opacity-50">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="תזכורת ראשונה – כמה ימים אחרי מועד התשלום (או הרישום)">
            <Input type="number" inputMode="numeric" min={0} max={365} value={p.firstDelayDays} onChange={(e) => set({ firstDelayDays: Number(e.target.value) })} />
          </Field>
          <Field label="תזכורת חוזרת – לכל היותר אחת כל כמה ימים">
            <Input type="number" inputMode="numeric" min={1} max={365} value={p.intervalDays} onChange={(e) => set({ intervalDays: Number(e.target.value) })} />
          </Field>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">ימי שליחה</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="ימי שליחה">
            {DAYS.map((d, i) => {
              const on = p.days.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ days: on ? p.days.filter((x) => x !== i) : [...p.days, i].sort() })}
                  className={`min-h-11 min-w-11 rounded-lg border px-3 font-medium ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="שעת שליחה (שעון ישראל)">
            <Input
              type="time"
              step={300}
              value={time}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                set({ hour: h ?? 10, minute: m ?? 0 });
              }}
            />
          </Field>
          <div className="self-end">
            <Toggle label="לא לשלוח בחגים ובחול המועד" checked={p.skipHolidays} onChange={(v) => set({ skipHolidays: v })} />
          </div>
        </div>
      </fieldset>
      <div className="space-y-2">
        <Toggle label="נוסח מותאם אישית" hint="אפשר להשתמש ב-{שם} {שם_מלא} {סכום} {בית_כנסת} {קישור}. חובה לכלול {קישור}." checked={custom} onChange={(v) => { setCustom(v); if (v && !p.template) set({ template: DEFAULT_TEMPLATE }); }} />
        {custom && <Textarea aria-label="נוסח התזכורת" rows={4} value={p.template ?? ""} onChange={(e) => set({ template: e.target.value })} maxLength={700} />}
        <div className="rounded-lg bg-green-50 p-3 text-sm whitespace-pre-wrap" aria-label="תצוגה מקדימה">
          <p className="mb-1 text-xs font-semibold text-green-900">תצוגה מקדימה</p>
          {preview}
        </div>
        <p className="text-xs text-slate-500">שורת ההסרה מתווספת תמיד ואינה ניתנת להסרה. בחיבור וואטסאפ אמיתי הנוסח צריך אישור תבנית של Meta.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy}>שמירת מדיניות תזכורות</Button>
        {note}
      </div>
    </form>
  );
}

export function BehaviourForm({
  initial,
  save: saveFn = updateBehaviourSettingsAction,
}: {
  initial: TenantSettings;
  save?: (s: TenantSettings) => Promise<{ ok: boolean; error?: string; message?: string }>;
}) {
  const [s, setS] = useState(initial);
  const { busy, save, note } = useSave();
  const set = (patch: Partial<TenantSettings>) => setS((x) => ({ ...x, ...patch }));
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save(() => saveFn(s));
      }}
    >
      <section className="space-y-2">
        <h3 className="font-semibold">הודעות</h3>
        <Toggle label="הודעת אישור למתפלל אחרי תשלום" checked={s.paymentConfirmationMessage} onChange={(v) => set({ paymentConfirmationMessage: v })} />
        <Toggle
          label="השהיית תזכורות כשיש בירור או דיווח תשלום פתוח"
          hint="עד שהגבאי מטפל בפנייה."
          checked={s.pauseRemindersOnOpenTask}
          onChange={(v) => set({ pauseRemindersOnOpenTask: v })}
        />
        <Field label="השהיית תזכורות אחרי שמתפלל פתח דף תשלום (שעות, 0 = ללא)">
          <Input type="number" inputMode="numeric" min={0} max={168} value={s.pauseAfterPaymentLinkHours} onChange={(e) => set({ pauseAfterPaymentLinkHours: Number(e.target.value) })} />
        </Field>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">העמוד האישי ותפריט הוואטסאפ</h3>
        <Toggle label="תשלום חלקי" checked={s.portalPartialPayment} onChange={(v) => set({ portalPartialPayment: v })} />
        {s.portalPartialPayment && (
          <Field label="סכום מינימלי לתשלום חלקי (₪, 0 = ללא)">
            <Input type="number" inputMode="decimal" min={0} value={s.portalMinPartialAgorot / 100} onChange={(e) => set({ portalMinPartialAgorot: Math.round(Number(e.target.value) * 100) })} />
          </Field>
        )}
        <Toggle label="בחירת נדרים לתשלום" checked={s.portalSelectPledges} onChange={(v) => set({ portalSelectPledges: v })} />
        <Toggle label="״שילמתי בדרך אחרת״ – דיווח מזומן/העברה/צ׳ק" hint="החוב יורד רק אחרי אישורך." checked={s.portalReportExternalPayment} onChange={(v) => set({ portalReportExternalPayment: v })} />
        <Toggle label="בקשת בירור חוב" checked={s.portalInquiry} onChange={(v) => set({ portalInquiry: v })} />
        <Field label="תוקף קישור אישי (ימים)">
          <Input type="number" inputMode="numeric" min={1} max={365} value={s.personalLinkDays} onChange={(e) => set({ personalLinkDays: Number(e.target.value) })} />
        </Field>
        <p className="text-xs text-slate-500">הפסקת תזכורות זמינה תמיד למתפלל ואינה ניתנת לכיבוי.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">כספים וקבלות</h3>
        <Toggle
          label="שימוש אוטומטי בזכות לנדרים חדשים"
          hint="כשכבוי – הזכות נשארת בכרטיס עד שתחליטו להחיל אותה (כפתור בכרטיס)."
          checked={s.autoApplyCredit}
          onChange={(v) => set({ autoApplyCredit: v })}
        />
        <Toggle label="הפקת קבלה אוטומטית אחרי תשלום" hint="פועל רק כששירות קבלות מחובר." checked={s.autoReceipts} onChange={(v) => set({ autoReceipts: v })} />
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy}>שמירת הגדרות</Button>
        {note}
      </div>
    </form>
  );
}
