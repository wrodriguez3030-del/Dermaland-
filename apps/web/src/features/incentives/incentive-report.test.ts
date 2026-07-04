import { describe, it, expect } from "vitest";
import { rankSellers, summarize } from "./incentive-report";
import type { IncentiveRecord } from "./incentive-store";

function inc(o: Partial<IncentiveRecord>): IncentiveRecord {
  return {
    id: "i1",
    saleId: "s1",
    sellerId: "seller1",
    sellerName: "Ana",
    ruleId: "r1",
    ruleName: "5%",
    ruleType: "percent_on_sale",
    productId: null,
    baseAmount: 1000,
    incentiveAmount: 50,
    status: "pending",
    earnedAt: "2026-07-04T10:00:00Z",
    paidAt: null,
    paymentBatchId: null,
    ...o,
  };
}

describe("rankSellers", () => {
  it("agrupa por vendedor, cuenta ventas distintas y separa pagado/pendiente", () => {
    const rows = rankSellers([
      inc({ id: "1", saleId: "sA", sellerId: "s1", sellerName: "Ana", incentiveAmount: 50, status: "pending" }),
      inc({ id: "2", saleId: "sA", sellerId: "s1", sellerName: "Ana", incentiveAmount: 30, status: "paid" }),
      inc({ id: "3", saleId: "sB", sellerId: "s1", sellerName: "Ana", incentiveAmount: 20, status: "pending" }),
      inc({ id: "4", saleId: "sC", sellerId: "s2", sellerName: "Beto", incentiveAmount: 200, status: "paid" }),
    ]);
    const ana = rows.find((r) => r.sellerId === "s1")!;
    expect(ana).toMatchObject({ sales: 2, generated: 100, paid: 30, pending: 70 });
    // ordenado por generado desc → Beto (200) primero
    expect(rows[0]!.sellerId).toBe("s2");
  });

  it("ignora incentivos anulados (void)", () => {
    const rows = rankSellers([
      inc({ id: "1", incentiveAmount: 50, status: "void" }),
      inc({ id: "2", incentiveAmount: 30, status: "paid" }),
    ]);
    expect(rows[0]!.generated).toBe(30);
  });
});

describe("summarize", () => {
  it("18. calcula KPIs: generado, pagado, pendiente, ventas, promedio, top", () => {
    const s = summarize([
      inc({ id: "1", saleId: "sA", incentiveAmount: 100, status: "paid" }),
      inc({ id: "2", saleId: "sB", incentiveAmount: 50, status: "pending" }),
    ]);
    expect(s.generated).toBe(150);
    expect(s.paid).toBe(100);
    expect(s.pending).toBe(50);
    expect(s.incentivizedSales).toBe(2);
    expect(s.avgPerSale).toBe(75);
    expect(s.topSeller).toBe("Ana");
  });

  it("sin incentivos → todo en cero", () => {
    const s = summarize([]);
    expect(s).toMatchObject({ generated: 0, incentivizedSales: 0, topSeller: null });
  });
});
