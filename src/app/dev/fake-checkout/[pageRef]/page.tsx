import { fakeGet } from "@/server/providers/fake-store";
import type { FakePage } from "@/server/providers/fake-payment";
import { Alert, Card, Money } from "@/components/ui";
import { CheckoutButtons } from "./buttons";

export default async function FakeCheckout({ params }: { params: Promise<{ pageRef: string }> }) {
  const { pageRef } = await params;
  const page = await fakeGet<FakePage>("payment_page", pageRef);
  if (!page) return <Alert tone="error">דף תשלום לא קיים.</Alert>;
  return (
    <Card title="דף סליקה מדומה">
      <p className="mb-2">לתשלום: <Money agorot={page.amountAgorot} className="text-2xl font-bold" /></p>
      <p className="mb-4 text-sm text-slate-500">כאן היה מוזן כרטיס האשראי בדף של חברת הסליקה. אין להזין פרטי כרטיס אמיתיים.</p>
      {page.status === "done" ? <Alert tone="success">הדף כבר שולם.</Alert> : <CheckoutButtons pageRef={pageRef} amountAgorot={page.amountAgorot} />}
    </Card>
  );
}
