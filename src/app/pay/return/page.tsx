import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/brand";
import { portalCtx } from "@/server/portal/links";
import { currentPortal } from "@/server/portal/current";
import { paymentRequestStatus } from "@/server/payments/requests";
import { Alert, LinkButton } from "@/components/ui";
import { AutoRefresh } from "./refresh";

// Return page after the hosted payment page. It NEVER marks anything as paid: it only shows the status
// recorded by the server from verified provider data (callback / status query).
export default async function PayReturn({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const p = await currentPortal();
  if (!p || !r || !z.uuid().safeParse(r).success)
    return (
      <AuthShell title="חזרה מהתשלום">
        <Alert>אפשר לחזור לעמוד האישי דרך הקישור שקיבלתם.</Alert>
      </AuthShell>
    );
  const s = await paymentRequestStatus(portalCtx(p), r).catch(() => null);
  return (
    <AuthShell title={s?.status === "paid" ? "תודה רבה!" : "בודקים את התשלום…"}>
      {s?.status === "paid" ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-9" aria-hidden />
          </span>
          <Alert tone="success">התשלום התקבל ואושר. תודה!</Alert>
        </div>
      ) : (
        <>
          <div className="flex justify-center py-2">
            <Loader2 className="size-10 animate-spin text-brand-500" aria-hidden />
          </div>
          <Alert>אנחנו בודקים את מצב התשלום מול חברת הסליקה. העמוד יתעדכן אוטומטית. אין צורך לשלם שוב.</Alert>
          <AutoRefresh />
        </>
      )}
      <LinkButton href="/me" className="w-full" size="lg">חזרה לעמוד האישי</LinkButton>
    </AuthShell>
  );
}
