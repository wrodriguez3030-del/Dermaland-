import { describe, it, expect } from "vitest";
import type { Payment, PaymentMethod, Proforma } from "@/types";
import { buildCommissionReport } from "./commission-engine";
import { buildCommissionWorkbookSpec } from "./commission-report-excel";
import { buildCommissionPdfSpec } from "./commission-report-pdf";

let seq = 0;
function mkSale(method: PaymentMethod, subtotal: number, over: Partial<Proforma> = {}): Proforma {
  seq += 1;
  const pay: Payment = {
    id: `pay${seq}`, proformaId: `s${seq}`, method, amount: subtotal,
    userId: "u1", userName: "Rosa", createdAt: "2026-05-30T10:00:00Z",
  };
  return {
    id: over.id ?? `s${seq}`, businessId: "biz_dermaland", branchId: over.branchId ?? "b_cutis",
    number: over.number ?? `B020001${seq}`, customerName: "Cliente X",
    cashierId: "u_rosa", cashierName: "Rosa Peralta",
    sellerId: over.sellerId ?? "v1", sellerName: over.sellerName ?? "Wilson",
    items: [], subtotal, discount: over.discount ?? 0, itbis: over.itbis ?? 0,
    total: subtotal + (over.itbis ?? 0) - (over.discount ?? 0),
    status: over.status ?? "paid", payments: [pay], paid: subtotal, balance: 0,
    documentKind: "invoice", createdAt: over.createdAt ?? "2026-05-30T10:00:00Z",
    updatedAt: "2026-05-30T10:00:00Z",
  };
}

const sales: Proforma[] = [
  mkSale("cash", 1500),
  mkSale("card", 10000, { itbis: 1800 }),
  mkSale("transfer", 2000, { sellerId: "v2", sellerName: "Ana", branchId: "b_olga" }),
  mkSale("cash", 5000, { status: "cancelled" }),
];
const report = buildCommissionReport(sales, {}, undefined, {
  branchNames: new Map([["b_cutis", "DermaLand Cutis"], ["b_olga", "Villa Olga"]]),
});

const meta = {
  title: "Reporte de Comisión de Ventas", subtitle: "test", rangeLabel: "Mayo 2026",
  branchLabel: "Todas", filtersLabel: "—", generatedBy: "Tester", generatedAtLabel: "2026-05-31",
};

describe("commission Excel (§16/§17/§18)", () => {
  const wb = buildCommissionWorkbookSpec(report, meta);

  it("18. genera las 9 hojas esperadas", () => {
    expect(wb.sheets.map((s) => s.name)).toEqual([
      "Resumen",
      "Detalle comisiones",
      "Por vendedor",
      "Por método de pago",
      "Por sucursal",
      "Pendientes",
      "Pagadas",
      "Excluidas",
      "Ajustes",
    ]);
  });

  it("la hoja Detalle tiene las columnas de referencia (§18)", () => {
    const detalle = wb.sheets.find((s) => s.name === "Detalle comisiones")!;
    const headers = detalle.tables[0]!.columns.map((c) => c.header);
    expect(headers).toEqual(
      expect.arrayContaining([
        "Número de comprobante", "Método de pago", "Fecha", "Sucursal", "Cliente",
        "Vendedor", "Cajero", "Subtotal", "Descuento", "Antes de impuestos",
        "Comisión 3%", "Comisión 1%", "Otra comisión", "Impuestos",
        "Después de impuestos", "Estado", "Fecha de pago",
      ]),
    );
  });

  it("la hoja Excluidas incluye la venta anulada", () => {
    const excl = wb.sheets.find((s) => s.name === "Excluidas")!;
    expect(excl.tables[0]!.rows.length).toBe(1); // s4 cancelada
  });
});

describe("20/21. Pantalla = Excel = PDF (misma capa central)", () => {
  const wb = buildCommissionWorkbookSpec(report, meta);
  const pdf = buildCommissionPdfSpec(report, {
    ...meta, reportKind: "Comisión de ventas", periodLabel: "Mayo 2026",
  } as never);

  const kpiVal = (label: string) =>
    wb.sheets[0]!.kpis!.find((x) => x.label === label)?.value;
  const pdfKpiVal = (label: string) => pdf.kpis?.find((x) => x.label === label)?.value;

  it("Comisión total: pantalla == Excel == PDF", () => {
    expect(report.kpis.commissionTotal).toBe(205); // cash 45 + card 100 + transfer 60
    expect(kpiVal("Comisión total")).toBe(report.kpis.commissionTotal);
    expect(pdfKpiVal("Comisión total")).toBe(report.kpis.commissionTotal);
  });

  it("Comisión 3% y 1% consistentes en las tres salidas", () => {
    expect(kpiVal("Comisión 3%")).toBe(report.kpis.commission3);
    expect(pdfKpiVal("Comisión 3%")).toBe(report.kpis.commission3);
    expect(kpiVal("Comisión 1%")).toBe(report.kpis.commission1);
    expect(pdfKpiVal("Comisión 1%")).toBe(report.kpis.commission1);
  });

  it("Base comisionable consistente", () => {
    expect(kpiVal("Base comisionable")).toBe(report.kpis.commissionableBase);
    expect(pdfKpiVal("Base comisionable")).toBe(report.kpis.commissionableBase);
  });
});
