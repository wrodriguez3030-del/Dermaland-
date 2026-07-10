import { describe, it, expect } from "vitest";
import type { Proforma } from "@/types";
import type { IncentiveRecord } from "@/features/incentives/incentive-store";
import { summarize, rankSellers } from "@/features/incentives/incentive-report";
import { getCommissionSummary } from "./central";
import { commissionReportFromIncentives } from "./report-from-incentives";

function inc(over: Partial<IncentiveRecord>): IncentiveRecord {
  return {
    id: over.id ?? "i1",
    saleId: over.saleId ?? "s1",
    sellerId: over.sellerId ?? "u_will",
    sellerName: over.sellerName ?? "Willian",
    ruleId: over.ruleId ?? "r3",
    ruleName: over.ruleName ?? "Efectivo y transferencia 3%",
    ruleType: "percent_on_sale",
    productId: null,
    baseAmount: over.baseAmount ?? 1686.44,
    incentiveAmount: over.incentiveAmount ?? 50.59,
    status: over.status ?? "pending",
    earnedAt: over.earnedAt ?? "2026-07-04T18:19:00Z",
    paidAt: null,
    paymentBatchId: null,
    saleBranchId: over.saleBranchId ?? "b1",
  } as IncentiveRecord;
}

function sale(id: string, number: string): Proforma {
  return {
    id,
    number,
    customerName: "Consumidor final",
    cashierName: "Caja 1",
    branchId: "b1",
    subtotal: 1686.44,
    discount: 0,
    itbis: 303.56,
    total: 1990,
    status: "paid",
    createdAt: "2026-07-04T18:19:00Z",
    payments: [{ method: "cash", amount: 1990 } as never],
    items: [],
  } as unknown as Proforma;
}

// Mismos 4 snapshots que el backfill de prod (Willian ×2, Dario ×2, cash 3%).
const INCENTIVES: IncentiveRecord[] = [
  inc({ id: "a", saleId: "s1", sellerId: "u_will", sellerName: "Willian" }),
  inc({ id: "b", saleId: "s2", sellerId: "u_will", sellerName: "Willian" }),
  inc({ id: "c", saleId: "s3", sellerId: "u_dar", sellerName: "Dario" }),
  inc({ id: "d", saleId: "s4", sellerId: "u_dar", sellerName: "Dario" }),
];
const SALES = new Map([
  ["s1", sale("s1", "B0100000001")],
  ["s2", sale("s2", "B0100000002")],
  ["s3", sale("s3", "B0100000003")],
  ["s4", sale("s4", "B0100000004")],
]);

describe("report-from-incentives — paridad reporte Comisión ↔ Incentivos", () => {
  const report = commissionReportFromIncentives(INCENTIVES, SALES, {});

  it("comisión total del reporte == generado de Incentivos (misma fuente)", () => {
    expect(report.kpis.commissionTotal).toBe(summarize(INCENTIVES).generated);
    expect(report.kpis.commissionTotal).toBe(202.36); // 4 × 50.59
  });

  it("base comisionable y ventas cuadran", () => {
    expect(report.kpis.commissionableBase).toBe(6745.76); // 4 × 1686.44
    expect(report.kpis.commissionableSales).toBe(4);
    // La tasa se deriva del snapshot (50.59/1686.44 ≈ 3%).
    expect(report.kpis.commission3).toBe(202.36);
    expect(report.kpis.commission1).toBe(0);
  });

  it("por vendedor == ranking de Incentivos (mismos importes)", () => {
    const ranking = rankSellers(INCENTIVES);
    for (const row of report.bySeller) {
      const src = ranking.find((r) => r.sellerId === row.sellerId)!;
      expect(row.commissionTotal).toBe(src.generated);
    }
    const will = report.bySeller.find((r) => r.sellerId === "u_will")!;
    expect(will.commissionTotal).toBe(101.18); // 2 × 50.59
  });

  it("el KPI central y el reporte coinciden", () => {
    expect(report.kpis.commissionTotal).toBe(
      getCommissionSummary(INCENTIVES).commissionTotal,
    );
  });

  it("por método clasifica efectivo y por sucursal agrupa", () => {
    expect(report.byMethod.find((m) => m.group === "cash")?.commission).toBe(202.36);
    expect(report.byBranch[0]?.commission).toBe(202.36);
  });
});
