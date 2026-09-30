import type { Tx } from "../db/client";

// Pure computations over ledger rows. Balances are always derived, never stored.

export type PledgeRow = {
  id: string;
  kind: string;
  amountAgorot: number;
  pledgeDate: Date;
  dueDate: Date | null;
  createdAt: Date;
  description: string | null;
  category: string | null;
  adjustments: { deltaAgorot: number }[];
  allocations: { amountAgorot: number }[];
};

export type PaymentRow = {
  id: string;
  status: string;
  method: string;
  amountAgorot: number;
  receivedAt: Date;
  refunds: { amountAgorot: number }[];
  allocations: { amountAgorot: number }[];
};

export const sum = (xs: { amountAgorot?: number; deltaAgorot?: number }[]) =>
  xs.reduce((s, x) => s + (x.amountAgorot ?? x.deltaAgorot ?? 0), 0);

export function pledgeFigures(p: PledgeRow) {
  const effective = p.amountAgorot + sum(p.adjustments);
  const allocated = sum(p.allocations);
  return { effective, allocated, outstanding: effective - allocated };
}

export function paymentFigures(p: PaymentRow) {
  const refunded = sum(p.refunds);
  const net = p.status === "confirmed" ? p.amountAgorot - refunded : 0;
  const allocated = sum(p.allocations);
  return { refunded, net, allocated, credit: net - allocated };
}

export type CardSummary = {
  debtAgorot: number; // sum of outstanding pledges
  creditAgorot: number; // unallocated confirmed money
  pendingExternalAgorot: number; // reported, awaiting gabbai approval (does NOT reduce debt)
  balanceAgorot: number; // debt - credit (negative = credit)
};

export function summarize(pledges: PledgeRow[], payments: PaymentRow[]): CardSummary {
  const debt = pledges.reduce((s, p) => s + pledgeFigures(p).outstanding, 0);
  const credit = payments.reduce((s, p) => s + Math.max(0, paymentFigures(p).credit), 0);
  const pending = payments.filter((p) => p.status === "pending_approval").reduce((s, p) => s + p.amountAgorot, 0);
  return { debtAgorot: debt, creditAgorot: credit, pendingExternalAgorot: pending, balanceAgorot: debt - credit };
}

export async function loadCard(tx: Tx, congregantId: string) {
  const [pledges, payments] = await Promise.all([
    tx.pledge.findMany({
      where: { congregantId },
      include: { adjustments: { orderBy: { createdAt: "asc" } }, allocations: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ pledgeDate: "asc" }, { createdAt: "asc" }],
    }),
    tx.payment.findMany({
      where: { congregantId },
      include: { refunds: { orderBy: { createdAt: "asc" } }, allocations: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return { pledges, payments, summary: summarize(pledges, payments) };
}

export async function cardSummary(tx: Tx, congregantId: string): Promise<CardSummary> {
  return (await loadCard(tx, congregantId)).summary;
}
