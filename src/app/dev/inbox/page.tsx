import { prisma } from "@/server/db/client";
import { Card, fmtDateTime } from "@/components/ui";
import { DevForms } from "./forms";

export const dynamic = "force-dynamic";

export default async function DevInbox() {
  const rows = await prisma.devFakeRecord.findMany({ where: { kind: { in: ["message", "otp", "email", "payment_txn", "receipt"] } }, orderBy: { createdAt: "desc" }, take: 60 });
  const TITLE: Record<string, string> = { message: "וואטסאפ יוצא", otp: "קוד אימות", email: "דוא״ל", payment_txn: "עסקת סליקה", receipt: "קבלה" };
  return (
    <>
      <h1 className="text-2xl font-bold">תיבת דואר לפיתוח</h1>
      <DevForms />
      <Card title="אירועים אחרונים">
        <ul className="space-y-2 text-sm">
          {rows.map((r) => {
            const d = r.data as Record<string, unknown>;
            return (
              <li key={r.id} className="rounded-lg border border-slate-200 p-2">
                <p className="font-medium">{TITLE[r.kind]} · {fmtDateTime(r.createdAt)}</p>
                {r.kind === "otp" && <p>ל-<span className="num">{String(d.phone)}</span>: קוד <b className="num text-lg">{String(d.code)}</b></p>}
                {r.kind === "message" && <p className="whitespace-pre-wrap">ל-<span className="num">{String(d.to)}</span> (חשבון {String(d.from)}): {String(d.text ?? "")}</p>}
                {r.kind === "email" && <p>ל-{String(d.to)}: {String(d.subject)} – <a className="break-all text-brand-700 underline" href={String(d.url)}>{String(d.url)}</a></p>}
                {r.kind === "payment_txn" && <p className="num text-right">{String(d.operation)} {String(d.status)} {Number(d.amountAgorot) / 100}₪ tx={String(d.transactionId)} account={String(d.accountId)}</p>}
                {r.kind === "receipt" && <p>קבלה {String(d.documentNumber)}</p>}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
