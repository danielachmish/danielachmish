import { z } from "zod";
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
    return <main className="mx-auto max-w-md px-4 py-8"><Alert>אפשר לחזור לעמוד האישי דרך הקישור שקיבלתם.</Alert></main>;
  const s = await paymentRequestStatus(portalCtx(p), r).catch(() => null);
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      {s?.status === "paid" ? (
        <Alert tone="success">התשלום התקבל ואושר. תודה!</Alert>
      ) : (
        <>
          <Alert>אנחנו בודקים את מצב התשלום מול חברת הסליקה. העמוד יתעדכן אוטומטית. אין צורך לשלם שוב.</Alert>
          <AutoRefresh />
        </>
      )}
      <LinkButton href="/me" className="w-full">חזרה לעמוד האישי</LinkButton>
    </main>
  );
}
