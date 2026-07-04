import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildIncentivesWorkbook } from "./incentive-export";
import type { IncentiveRecord } from "./incentive-store";

function inc(o: Partial<IncentiveRecord>): IncentiveRecord {
  return {
    id: "i1",
    saleId: "s1",
    saleNumber: "B0200001247",
    saleCashier: "Rosa",
    saleCustomer: "Willian",
    saleBranchId: "br1",
    sellerId: "seller1",
    sellerName: "Ana",
    ruleId: "r1",
    ruleName: "5% venta",
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

const meta = {
  businessName: "DermaLand",
  generatedAt: "2026-07-04T10:00:00Z",
  rangeLabel: "Todo",
  filtersLabel: "Todos",
};

describe("buildIncentivesWorkbook", () => {
  it("19. genera las 6 hojas esperadas", () => {
    const wb = buildIncentivesWorkbook([inc({})], meta);
    expect(wb.SheetNames).toEqual([
      "Resumen",
      "Por vendedor",
      "Detalle por venta",
      "Detalle por producto",
      "Pagados",
      "Pendientes",
    ]);
  });

  it("la hoja Detalle por venta trae la fila con factura, vendedor e incentivo", () => {
    const wb = buildIncentivesWorkbook([inc({})], meta);
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Detalle por venta"]!, {
      header: 1,
    });
    const dump = JSON.stringify(rows);
    expect(dump).toContain("B0200001247");
    expect(dump).toContain("Ana");
    expect(dump).toContain("5% venta");
  });

  it("Pagados y Pendientes separan por estado", () => {
    const wb = buildIncentivesWorkbook(
      [
        inc({ id: "a", status: "paid", saleNumber: "PAG-1" }),
        inc({ id: "b", status: "pending", saleNumber: "PEND-1" }),
      ],
      meta,
    );
    expect(JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets["Pagados"]!, { header: 1 }))).toContain("PAG-1");
    expect(JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets["Pendientes"]!, { header: 1 }))).toContain("PEND-1");
  });
});
