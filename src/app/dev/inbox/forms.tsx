"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fakeInboundAction, fakeRefundAction, runSweepAction } from "../actions";
import { Button, Card, Field, Input } from "@/components/ui";

export function DevForms() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const wrap = (fn: () => Promise<unknown>) => fn().then(() => { setMsg("בוצע"); router.refresh(); }, (e) => setMsg(String(e.message)));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="הודעה נכנסת בוואטסאפ">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); wrap(() => fakeInboundAction(String(f.get("account")), String(f.get("from")), String(f.get("text")))); }}>
          <Field label="חשבון בית הכנסת"><Input name="account" dir="ltr" defaultValue="wa-demo-1" /></Field>
          <Field label="מטלפון"><Input name="from" dir="ltr" defaultValue="+972501111111" /></Field>
          <Field label="טקסט (1–5 / הסר)"><Input name="text" defaultValue="1" /></Field>
          <Button>שליחה</Button>
        </form>
      </Card>
      <Card title="החזר בממשק הספק">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); wrap(() => fakeRefundAction(String(f.get("account")), String(f.get("tx")), Number(f.get("amount")))); }}>
          <Field label="חשבון"><Input name="account" dir="ltr" defaultValue="pay-demo-1" /></Field>
          <Field label="מזהה עסקה מקורית"><Input name="tx" dir="ltr" required /></Field>
          <Field label="סכום (₪)"><Input name="amount" inputMode="decimal" dir="ltr" required /></Field>
          <Button>ביצוע החזר</Button>
        </form>
      </Card>
      <Card title="עבודות רקע">
        <Button variant="secondary" onClick={() => wrap(() => runSweepAction())}>הרצת sweep עכשיו</Button>
        <p className="mt-2 text-xs text-slate-500">ה-worker חייב לרוץ (npm run worker).</p>
      </Card>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
