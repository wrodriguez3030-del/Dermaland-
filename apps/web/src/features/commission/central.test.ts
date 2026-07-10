import { describe, it, expect } from "vitest";
import type { IncentiveRecord } from "@/features/incentives/incentive-store";
import { summarize, rankSellers } from "@/features/incentives/incentive-report";
import {
  getCommissionSummary,
  getCommissionBySeller,
  getTopSeller,
  applyCommissionFilters,
} from "./central";

// Snapshots de ejemplo (los MISMOS que verían ambos módulos desde sales_incentives).
function inc(over: Partial<IncentiveRecord>): IncentiveRecord {
  return {
    id: over.id ?? "i1",
    saleId: over.saleId ?? "s1",
    sellerId: over.sellerId ?? "u_rosa",
    sellerName: over.sellerName ?? "Rosa Peralta",
    ruleId: over.ruleId ?? "r_3pct",
    ruleName: over.ruleName ?? "3% efectivo",
    ruleType: over.ruleType ?? "percent_on_sale",
    productId: over.productId ?? null,
    baseAmount: over.baseAmount ?? 9000,
    incentiveAmount: over.incentiveAmount ?? 270,
    status: over.status ?? "pending",
    earnedAt: over.earnedAt ?? "2026-07-01T10:00:00Z",
    paidAt: over.paidAt ?? null,
    paymentBatchId: over.paymentBatchId ?? null,
    saleNumber: over.saleNumber,
    saleBranchId: over.saleBranchId,
  } as IncentiveRecord;
}

const SAMPLE: IncentiveRecord[] = [
  inc({ id: "a", saleId: "s1", sellerId: "u_rosa", sellerName: "Rosa Peralta", baseAmount: 9000, incentiveAmount: 270, status: "pending" }),
  inc({ id: "b", saleId: "s2", sellerId: "u_rosa", sellerName: "Rosa Peralta", baseAmount: 5000, incentiveAmount: 150, status: "paid" }),
  inc({ id: "c", saleId: "s3", sellerId: "u_juan", sellerName: "Juan Gómez", baseAmount: 10000, incentiveAmount: 100, status: "approved", ruleId: "r_1pct", ruleName: "1% tarjeta" }),
  inc({ id: "d", saleId: "s4", sellerId: "u_juan", sellerName: "Juan Gómez", baseAmount: 2000, incentiveAmount: 60, status: "void" }), // anulado: no cuenta
];

describe("capa central — paridad Incentivos ↔ Comisión ventas", () => {
  it("el TOTAL generado coincide en ambos módulos (misma fuente)", () => {
    const incentivosView = summarize(SAMPLE); // lo que ve Ventas > Incentivos
    const comisionView = getCommissionSummary(SAMPLE); // lo que ve Reportes > Comisión
    expect(comisionView.commissionTotal).toBe(incentivosView.generated);
    expect(comisionView.paidCommission).toBe(incentivosView.paid);
    expect(comisionView.pendingCommission).toBe(incentivosView.pending);
    // Números concretos: 270 + 150 + 100 = 520 (el anulado 'd' no cuenta).
    expect(comisionView.commissionTotal).toBe(520);
    expect(comisionView.paidCommission).toBe(150);
    expect(comisionView.pendingCommission).toBe(370);
  });

  it("el VENDEDOR TOP coincide (mismo ranking, sin cálculo independiente)", () => {
    const incentivosTop = summarize(SAMPLE).topSeller;
    const comisionTop = getTopSeller(SAMPLE);
    expect(comisionTop).toBe(incentivosTop);
    expect(comisionTop).toBe("Rosa Peralta"); // 270 + 150 = 420 > Juan 100
  });

  it("el resumen POR VENDEDOR coincide línea a línea con el ranking de Incentivos", () => {
    const ranking = rankSellers(SAMPLE);
    const bySeller = getCommissionBySeller(SAMPLE);
    expect(bySeller.map((r) => r.sellerId)).toEqual(ranking.map((r) => r.sellerId));
    for (const row of bySeller) {
      const src = ranking.find((r) => r.sellerId === row.sellerId)!;
      expect(row.commissionTotal).toBe(src.generated);
      expect(row.paid).toBe(src.paid);
      expect(row.pending).toBe(src.pending);
    }
  });

  it("la BASE comisionable suma solo líneas vivas (270 base 9000 + 5000 + 10000)", () => {
    expect(getCommissionSummary(SAMPLE).commissionableBase).toBe(24000);
  });

  it("desglose POR REGLA generaliza el 3%/1% desde los snapshots", () => {
    const byRule = getCommissionSummary(SAMPLE).byRule;
    const r3 = byRule.find((r) => r.ruleId === "r_3pct");
    const r1 = byRule.find((r) => r.ruleId === "r_1pct");
    expect(r3?.amount).toBe(420); // 270 + 150
    expect(r1?.amount).toBe(100);
  });

  it("los ESTADOS son únicos y coinciden: filtrar por estado da el mismo conjunto", () => {
    const pend = applyCommissionFilters(SAMPLE, { status: "pending" });
    expect(pend.map((i) => i.id)).toEqual(["a"]);
    const paid = applyCommissionFilters(SAMPLE, { status: "paid" });
    expect(paid.map((i) => i.id)).toEqual(["b"]);
  });

  it("filtrar por VENDEDOR es coherente entre módulos (mismos ids)", () => {
    const rosa = applyCommissionFilters(SAMPLE, { sellerId: "u_rosa" });
    expect(new Set(rosa.map((i) => i.id))).toEqual(new Set(["a", "b"]));
    // El resumen filtrado de ambos módulos coincide.
    expect(getCommissionSummary(rosa).commissionTotal).toBe(summarize(rosa).generated);
  });
});
