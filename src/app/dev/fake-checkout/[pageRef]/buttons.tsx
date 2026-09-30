"use client";
import { useState } from "react";
import { fakeCheckoutAction } from "../../actions";
import { Button } from "@/components/ui";

export function CheckoutButtons({ pageRef, amountAgorot }: { pageRef: string; amountAgorot: number }) {
  const [busy, setBusy] = useState(false);
  const go = async (outcome: "charged" | "failed" | "authorized_only", cb = true, amount?: number) => {
    setBusy(true);
    const r = await fakeCheckoutAction(pageRef, outcome, cb, amount);
    window.location.assign(r.returnUrl);
  };
  return (
    <div className="grid gap-2">
      <Button disabled={busy} onClick={() => go("charged")}>אישור חיוב (עם callback)</Button>
      <Button disabled={busy} variant="secondary" onClick={() => go("charged", false)}>חיוב + סגירת דפדפן ואובדן callback</Button>
      <Button disabled={busy} variant="secondary" onClick={() => go("authorized_only")}>אישור מסגרת בלבד (J5)</Button>
      <Button disabled={busy} variant="secondary" onClick={() => go("charged", true, amountAgorot - 100)}>חיוב בסכום שונה</Button>
      <Button disabled={busy} variant="danger" onClick={() => go("failed")}>כשל חיוב</Button>
    </div>
  );
}
