import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import type { Proforma, Payment, ProformaStatus } from "@/types";
import { buildSalesReport, EMPTY_FILTERS } from "./sales-report";
import {
  buildSalesDetailCsv,
  buildSalesReportWorkbook,
  salesReportFilename,
  salesReportXlsxBytes,
  type SalesReportMeta,
} from "./sales-report-export";

let seq = 0;
function pay(method: Payment["method"], amount: number): Payment {
  return {
    id: `pay-${seq++}`,
    proformaId: "x",
    method,
    amount,
    userId: "u1",
    userName: "Cajero 1",
    createdAt: "2026-06-15T10:00:00",
  };
}
function makeSale(p: Partial<Proforma> = {}): Proforma {
  const subtotal = p.subtotal ?? 100;
  const itbis = p.itbis ?? 18;
  const total = p.total ?? subtotal + itbis;
  return {
    id: p.id ?? `sale-${seq++}`,
    number: p.number ?? "B0200000001",
    customerName: p.customerName ?? "Consumidor final",
    cashierId: p.cashierId ?? "c1",
    cashierName: p.cashierName ?? "Rosa",
    items: p.items ?? [
      {
        productId: "p1",
        productSku: "SKU-1",
        productName: "Crema",
        quantity: 1,
        unitPrice: 100,
        itbisRate: 0.18,
        discount: 0,
        subtotal,
        itbis,
        total,
      },
    ],
    subtotal,
    discount: p.discount ?? 0,
    itbis,
    total,
    status: p.status ?? ("paid" as ProformaStatus),
    payments: p.payments ?? [pay("cash", total)],
    paid: total,
    balance: 0,
    businessId: "biz-1",
    branchId: p.branchId ?? "branch-1",
    createdAt: p.createdAt ?? "2026-06-15T10:00:00",
    updatedAt: "2026-06-15T10:00:00",
    documentKind: p.documentKind ?? "invoice",
    ecfNumber: p.ecfNumber,
    customerPhone: p.customerPhone,
    customerDocument: p.customerDocument,
  };
}

const branchNames = new Map([["branch-1", "DermaLand Principal"]]);
const meta: SalesReportMeta = {
  businessName: "DermaLand",
  generatedAt: "2026-06-29T12:00:00",
  rangeLabel: "2026-06-01 a 2026-06-29",
  branchLabel: "Todas las sucursales",
  filtersLabel: "Sin filtros adicionales",
};

describe("CSV", () => {
  it("13. genera CSV con encabezado y una línea por venta", () => {
    const all = [makeSale(), makeSale(), makeSale()];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    const csv = buildSalesDetailCsv(report);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Fecha y hora");
    expect(lines[0]).toContain("Total");
    expect(lines).toHaveLength(1 + 3); // header + 3 ventas
  });

  it("escapa comas y comillas en los campos", () => {
    const all = [makeSale({ customerName: 'Pérez, "El Jefe"' })];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    const csv = buildSalesDetailCsv(report);
    expect(csv).toContain('"Pérez, ""El Jefe"""');
  });
});

describe("Excel", () => {
  it("14. genera un libro con las 7 hojas requeridas", () => {
    const all = [makeSale(), makeSale({ status: "cancelled" })];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    const wb = buildSalesReportWorkbook(report, meta);
    expect(wb.SheetNames).toEqual([
      "Resumen",
      "Ventas detalle",
      "Métodos de pago",
      "Por cajero",
      "Por sucursal",
      "Productos vendidos",
      "Clientes",
    ]);
  });

  it("la hoja Resumen contiene el total facturado y el rango", () => {
    const all = [makeSale({ total: 118 }), makeSale({ total: 236 })];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    const bytes = salesReportXlsxBytes(report, meta);
    const wb = XLSX.read(bytes, { type: "array" });
    const resumen = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Resumen"]!, {
      header: 1,
    });
    const flat = JSON.stringify(resumen);
    expect(flat).toContain("Total facturado");
    expect(flat).toContain("354"); // 118 + 236
    expect(flat).toContain("2026-06-01 a 2026-06-29");
  });

  it("salesReportFilename produce nombre seguro", () => {
    expect(salesReportFilename("xlsx", "2026-06-01_2026-06-29")).toBe(
      "Reporte-ventas-2026-06-01_2026-06-29.xlsx",
    );
  });
});

describe("sin fugas técnicas", () => {
  it("12. el detalle exportado va en el mismo orden de las filas (recientes primero al venir del store)", () => {
    const all = [
      makeSale({ createdAt: "2026-06-20T10:00:00", number: "NUEVA" }),
      makeSale({ createdAt: "2026-06-10T10:00:00", number: "VIEJA" }),
    ];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    const csv = buildSalesDetailCsv(report);
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain("NUEVA");
    expect(lines[2]).toContain("VIEJA");
  });

  it("17 & 18. ni el CSV ni el Excel filtran UUIDs, branch_id, localStorage ni SupabaseRepository", () => {
    const all = [
      makeSale({ id: "550e8400-e29b-41d4-a716-446655440000", branchId: "branch-1" }),
    ];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    const csv = buildSalesDetailCsv(report);

    const wb = buildSalesReportWorkbook(report, meta);
    const dump = wb.SheetNames.map((n) =>
      XLSX.utils.sheet_to_csv(wb.Sheets[n]!),
    ).join("\n");
    const haystack = csv + "\n" + dump;

    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(uuid.test(haystack)).toBe(false);
    expect(haystack).not.toContain("branch-1");
    expect(haystack).not.toContain("biz-1");
    expect(haystack.toLowerCase()).not.toContain("localstorage");
    expect(haystack).not.toContain("SupabaseRepository");
  });
});
