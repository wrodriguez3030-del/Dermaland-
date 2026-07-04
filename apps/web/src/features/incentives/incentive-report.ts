import type { IncentiveRecord } from "./incentive-store";

/**
 * Agregaciones PURAS para el dashboard/ranking de incentivos y el Excel.
 */

export interface SellerIncentiveRow {
  sellerId: string;
  sellerName: string;
  /** Ventas distintas que generaron incentivo. */
  sales: number;
  generated: number;
  paid: number;
  pending: number;
}

export interface IncentiveSummary {
  generated: number;
  paid: number;
  pending: number;
  incentivizedSales: number;
  avgPerSale: number;
  topSeller: string | null;
}

const PENDING = new Set(["pending", "approved"]);

export function rankSellers(incentives: IncentiveRecord[]): SellerIncentiveRow[] {
  const acc = new Map<string, SellerIncentiveRow & { saleIds: Set<string> }>();
  for (const i of incentives) {
    if (i.status === "void") continue;
    const id = i.sellerId ?? "__none__";
    let row = acc.get(id);
    if (!row) {
      row = {
        sellerId: id,
        sellerName: i.sellerName ?? "No asignado",
        sales: 0,
        generated: 0,
        paid: 0,
        pending: 0,
        saleIds: new Set(),
      };
      acc.set(id, row);
    }
    row.generated += i.incentiveAmount;
    if (i.status === "paid") row.paid += i.incentiveAmount;
    if (PENDING.has(i.status)) row.pending += i.incentiveAmount;
    row.saleIds.add(i.saleId);
  }
  return [...acc.values()]
    .map(({ saleIds, ...r }) => ({ ...r, sales: saleIds.size }))
    .sort((a, b) => b.generated - a.generated);
}

export function summarize(incentives: IncentiveRecord[]): IncentiveSummary {
  const ranking = rankSellers(incentives);
  const generated = ranking.reduce((s, r) => s + r.generated, 0);
  const paid = ranking.reduce((s, r) => s + r.paid, 0);
  const pending = ranking.reduce((s, r) => s + r.pending, 0);
  const saleIds = new Set(
    incentives.filter((i) => i.status !== "void").map((i) => i.saleId),
  );
  const incentivizedSales = saleIds.size;
  return {
    generated: round2(generated),
    paid: round2(paid),
    pending: round2(pending),
    incentivizedSales,
    avgPerSale: incentivizedSales ? round2(generated / incentivizedSales) : 0,
    topSeller: ranking[0]?.sellerName ?? null,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
