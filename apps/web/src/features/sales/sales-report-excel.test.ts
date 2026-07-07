import { describe, it, expect } from "vitest";
import { buildSalesReport, type SalesReportFilters } from "./sales-report";
import { buildSalesWorkbookSpec } from "./sales-report-excel";
import type { Proforma } from "@/types";
import type { ReportMeta } from "@/lib/reports/excel/types";

/**
 * Paridad pantalla ↔ Excel: el spec del libro se construye desde el MISMO
 * `SalesReport` que renderiza la pantalla (mismos filtros aplicados por
 * `buildSalesReport`), así que si los KPIs de pantalla dicen X el Excel
 * dice X. Estos tests lo verifican con datos sintéticos y filtros reales.
 */

const META: ReportMeta = {
  title: "Reporte de ventas",
  rangeLabel: "Todo",
  branchLabel: "Todas las sucursales",
  filtersLabel: "Sin filtros adicionales",
  generatedBy: "Wilson Rodríguez",
  generatedAtLabel: "06/07/2026 04:00 p. m.",
};

function sale(overrides: Partial<Proforma>): Proforma {
  return {
    id: `s_${Math.random().toString(36).slice(2, 8)}`,
    businessId: "b",
    branchId: "br_1",
    number: "B0200001000",
    customerName: "WILLIAN R RODRIGUEZ",
    customerId: "c1",
    cashierId: "u1",
    cashierName: "Rosa",
    sellerId: "v1",
    sellerName: "Dario",
    items: [
      {
        productId: "p1",
        productSku: "SKU1",
        productName: "Protector solar",
        quantity: 1,
        unitPrice: 100,
        itbisRate: 0.18,
        discount: 0,
        subtotal: 100,
        itbis: 18,
        total: 118,
      },
    ],
    subtotal: 100,
    discount: 0,
    itbis: 18,
    total: 118,
    paid: 118,
    balance: 0,
    status: "paid",
    documentKind: "invoice",
    payments: [
      {
        id: "pay1",
        proformaId: "x",
        method: "cash",
        amount: 118,
        userId: "u1",
        userName: "Rosa",
        createdAt: "2026-07-01T10:00:00Z",
      },
    ],
    createdAt: "2026-07-01T10:00:00Z",
    updatedAt: "2026-07-01T10:00:00Z",
    ...overrides,
  } as Proforma;
}

const ALL: Proforma[] = [
  sale({ id: "a", total: 118, itbis: 18 }),
  sale({ id: "b", total: 236, itbis: 36, subtotal: 200, branchId: "br_2" }),
  sale({
    id: "c",
    total: 500,
    itbis: 76.27,
    sellerName: "Maria",
    sellerId: "v2",
    payments: [
      {
        id: "pay2",
        proformaId: "c",
        method: "card",
        amount: 500,
        userId: "u1",
        userName: "Rosa",
        createdAt: "2026-06-01T10:00:00Z",
      },
    ],
    createdAt: "2026-06-01T10:00:00Z",
  }),
  sale({ id: "d", status: "cancelled", total: 999 }),
];

const EMPTY: SalesReportFilters = {};

describe("buildSalesWorkbookSpec — paridad con pantalla", () => {
  const report = buildSalesReport(ALL, EMPTY);
  const spec = buildSalesWorkbookSpec(report, META);

  it("genera las 8 hojas esperadas", () => {
    expect(spec.sheets.map((s) => s.name)).toEqual([
      "Resumen",
      "Ventas detalle",
      "Métodos de pago",
      "Por cajero",
      "Por vendedor",
      "Por sucursal",
      "Productos vendidos",
      "Clientes",
    ]);
  });

  it("KPIs del Resumen = KPIs de la pantalla (total, ITBIS, transacciones, items)", () => {
    const kpis = spec.sheets[0]!.kpis!;
    const byLabel = new Map(kpis.map((k) => [k.label, k.value]));
    expect(byLabel.get("Total facturado")).toBe(report.kpis.totalBilled);
    expect(byLabel.get("ITBIS recaudado")).toBe(report.kpis.itbis);
    expect(byLabel.get("Transacciones")).toBe(report.kpis.transactions);
    expect(byLabel.get("Items vendidos")).toBe(report.kpis.items);
    expect(byLabel.get("Ticket promedio")).toBe(report.kpis.avgTicket);
  });

  it("detalle incluye la columna Vendedor con el nombre real", () => {
    const detalle = spec.sheets[1]!.tables[0]!;
    expect(detalle.columns.some((c) => c.header === "Vendedor")).toBe(true);
    const sellers = detalle.rows.map((r) => r.seller);
    expect(sellers).toContain("Dario");
    expect(sellers).toContain("Maria");
  });

  it("fila TOTALES del detalle cuadra con los KPIs", () => {
    const totals = spec.sheets[1]!.tables[0]!.totals!;
    expect(totals.total).toBe(report.kpis.totalBilled);
    expect(totals.itbis).toBe(report.kpis.itbis);
    expect(totals.items).toBe(report.kpis.items);
  });

  it("métodos de pago cuadran (monto total = suma de métodos)", () => {
    const table = spec.sheets[2]!.tables[0]!;
    const sum = table.rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    expect(Math.round(sum * 100) / 100).toBe(Number(table.totals!.amount));
    expect(table.totals!.pct).toBe(1);
  });

  it("anuladas NO se suman al total facturado", () => {
    // La pantalla muestra la anulada con estado; los KPIs la excluyen del
    // total. El Excel replica exactamente las filas y KPIs de pantalla.
    expect(spec.sheets[1]!.tables[0]!.rows.length).toBe(report.rows.length);
    expect(report.kpis.totalBilled).toBe(118 + 236 + 500);
  });
});

describe("buildSalesWorkbookSpec — respeta filtros", () => {
  it("filtro por sucursal reduce filas y totales igual que pantalla", () => {
    const filtered = buildSalesReport(ALL, { branchId: "br_2" });
    const spec = buildSalesWorkbookSpec(filtered, META);
    expect(spec.sheets[1]!.tables[0]!.rows).toHaveLength(1);
    expect(spec.sheets[1]!.tables[0]!.totals!.total).toBe(236);
  });

  it("filtro por vendedor respeta sellerId", () => {
    const filtered = buildSalesReport(ALL, { sellerId: "v2" });
    const spec = buildSalesWorkbookSpec(filtered, META);
    expect(spec.sheets[1]!.tables[0]!.rows).toHaveLength(1);
    expect(spec.sheets[1]!.tables[0]!.rows[0]!.seller).toBe("Maria");
  });

  it("filtro por método de pago (tarjeta) respeta method", () => {
    const filtered = buildSalesReport(ALL, { method: "card" });
    const spec = buildSalesWorkbookSpec(filtered, META);
    expect(spec.sheets[1]!.tables[0]!.totals!.total).toBe(500);
  });

  it("filtro por rango de fechas respeta from/to", () => {
    const filtered = buildSalesReport(ALL, { from: "2026-07-01", to: "2026-07-31" });
    const spec = buildSalesWorkbookSpec(filtered, META);
    // 3 documentos de julio (a, b y la anulada d); la venta de junio (c)
    // queda fuera. La anulada aparece en el detalle igual que en pantalla,
    // pero NO suma al total facturado (solo a+b = 354).
    expect(spec.sheets[1]!.tables[0]!.rows).toHaveLength(3);
    expect(spec.sheets[1]!.tables[0]!.totals!.total).toBe(354);
  });

  it("filtro por cliente respeta customerQuery", () => {
    const withOther = [...ALL, sale({ id: "e", customerName: "OTRA PERSONA", total: 50 })];
    const filtered = buildSalesReport(withOther, { customerQuery: "WILLIAN" });
    const spec = buildSalesWorkbookSpec(filtered, META);
    expect(
      spec.sheets[1]!.tables[0]!.rows.every((r) =>
        String(r.customer).includes("WILLIAN"),
      ),
    ).toBe(true);
  });

  it("filtro por producto respeta productQuery", () => {
    const filtered = buildSalesReport(ALL, { productQuery: "Protector" });
    const spec = buildSalesWorkbookSpec(filtered, META);
    expect(spec.sheets[1]!.tables[0]!.rows.length).toBeGreaterThan(0);
    const none = buildSalesReport(ALL, { productQuery: "NoExiste" });
    expect(buildSalesWorkbookSpec(none, META).sheets[1]!.tables[0]!.rows).toHaveLength(0);
  });
});
