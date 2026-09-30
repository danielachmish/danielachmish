"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { connectIntegrationAction, disconnectIntegrationAction } from "@/app/(gabbai)/actions";
import { adminConnectIntegrationAction, adminDisconnectIntegrationAction } from "@/app/admin/actions";
import type { ProviderDef } from "@/server/integrations/catalog";
import type { ActionResult } from "@/server/actions/result";
import { WhatsAppSignupButton } from "./whatsapp-signup";
import { Alert, Badge, Button, Field, Input, Select } from "./ui";

type Current = { provider: string; environment: string; externalAccountId: string; displayName: string | null; status: string; lastError: string | null } | null;

/** Connect / replace / disconnect a synagogue's own payment or messaging account. Credentials are write-only. */
export function IntegrationPanel({
  kind,
  providers,
  current,
  target,
  embeddedSignup,
}: {
  kind: "payment" | "messaging";
  providers: ProviderDef[];
  current: Current;
  target: { type: "gabbai" } | { type: "admin"; tenantId: string };
  embeddedSignup?: { appId: string; configId: string; version: string } | null;
}) {
  const router = useRouter();
  const selectable = providers.filter((p) => p.status !== "planned");
  const [providerId, setProviderId] = useState(selectable[0]?.id ?? "");
  const [editing, setEditing] = useState(!current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const def = providers.find((p) => p.id === providerId);
  const nameOf = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  const act = async (fn: () => Promise<ActionResult<unknown>>) => {
    setBusy(true);
    const r = await fn().catch(() => ({ ok: false as const, error: "אין חיבור לשרת. נסו שוב." }));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: r.message ?? "נשמר" } : { ok: false, text: r.error });
    if (r.ok) {
      setEditing(false);
      router.refresh();
    }
  };

  return (
    <div className="space-y-3">
      {current ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={current.status === "active" ? "green" : "red"}>{current.status === "active" ? "מחובר" : "תקלה"}</Badge>
          <span className="font-medium">{nameOf(current.provider)}</span>
          <span className="num text-slate-600">{current.displayName ?? current.externalAccountId}</span>
          <span className="text-slate-500">סביבה: {current.environment}</span>
          {current.lastError && <span className="w-full text-red-700">תקלה אחרונה: {current.lastError}</span>}
        </div>
      ) : (
        <p className="text-sm text-slate-600">לא מחובר.</p>
      )}

      {current && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>החלפת חשבון</Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => act(() => (target.type === "admin" ? adminDisconnectIntegrationAction(target.tenantId, kind) : disconnectIntegrationAction(kind)))}
          >
            ניתוק
          </Button>
        </div>
      )}

      {editing && kind === "messaging" && embeddedSignup && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <WhatsAppSignupButton config={embeddedSignup} target={target} />
          <p className="mt-2 text-xs text-slate-500">או חיבור ידני (לבדיקות עם מספר הבדיקה של Meta):</p>
        </div>
      )}
      {editing && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!def) return;
            const f = new FormData(e.currentTarget);
            const input = {
              kind,
              provider: def.id,
              externalAccountId: String(f.get("externalAccountId") ?? ""),
              displayName: String(f.get("displayName") ?? ""),
              secrets: Object.fromEntries(def.fields.map((x) => [x.key, String(f.get(x.key) ?? "")])),
              confirmReplace: !!current,
            };
            act(() => (target.type === "admin" ? adminConnectIntegrationAction(target.tenantId, input) : connectIntegrationAction(input)));
          }}
        >
          <div className="sm:col-span-2">
            <Field label="ספק">
              <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.status === "planned"}>
                    {p.name}
                    {p.status === "planned" ? " – בפיתוח" : p.status === "unverified" ? " – טרם אומת" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {def?.note && <p className="text-xs text-amber-800 sm:col-span-2">{def.note}</p>}
          {def && (
            <>
              <Field label={def.accountLabel}>
                <Input name="externalAccountId" dir="ltr" required autoComplete="off" />
              </Field>
              <Field label="שם לתצוגה (לא חובה)">
                <Input name="displayName" />
              </Field>
              {def.fields.map((x) => (
                <Field key={x.key} label={x.label}>
                  <Input name={x.key} type={x.secret ? "password" : "text"} dir="ltr" autoComplete="off" required />
                </Field>
              ))}
            </>
          )}
          <p className="text-xs text-slate-500 sm:col-span-2">
            הפרטים נשמרים מוצפנים ולא יוצגו שוב.{current ? " עסקאות שכבר התחילו יישארו משויכות לחשבון הקודם." : ""}
          </p>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button disabled={busy || !def}>{current ? "החלפה לחשבון החדש" : "חיבור"}</Button>
            {current && (
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                ביטול
              </Button>
            )}
          </div>
        </form>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}
