import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import type { Laboratory, Product, Proforma } from "@/types";
import { computeLabSales, computeLabProductSales, summarizeLabSales } from "./lab-sales";
import {
  buildLabSalesWorkbook,
  buildLabSalesCsv,
  labSalesFilename,
  type LabSalesMeta,
} from "./lab-sales-export";

const labs: Laboratory[] = [
  { id: "lab_a", businessId: "b1", name: "ISDIN", country: "España", createdAt: "", updatedAt: "" },
  { id: "lab_b", businessId: "b1", name: "Avène", country: "Francia", createdAt: "", updatedAt: "" },
];
const products = [
  { id: "p1", laboratoryId: "lab_a" },
  { id: "p2", laboratoryId: "lab_b" },
] as unknown as Product[];

function pf(over: Partial<Proforma>): Proforma {
  return {
    id: "x", number: "P", customerName: "C", cashierId: "u", cashierName: "U",
    businessId: "b1", branchId: "br1", items: [], subtotal: 0, discount: 0, itbis: 0,
    total: 0, status: "paid", payments: [], paid: 0, balance: 0,
    createdAt: "2026-06-10T10:00:00Z", updatedAt: "2026-06-10T10:00:00Z", ...over,
  } as Proforma;
}
const item = (productId: string, sku: string, name: string, quantity: number, total: number) =>
  ({ productId, productSku: sku, productName: name, quantity, total } as never);

const proformas = [
  pf({ id: "s1", items: [item("p1", "SKU1", "Crema A", 3, 3000), item("p2", "SKU2", "Crema B", 1, 1000)] }),
  pf({ id: "s2", items: [item("p1", "SKU1", "Crema A", 2, 2000)] }),
];

const meta: LabSalesMeta = {
  businessName: "DermaLand",
  generatedAt: "2026-07-01T12:00:00Z",
  branchLabel: "Todas las sucursales",
  rangeLabel: "Todo",
  searchLabel: "—",
};

function workbook() {
  const rows = computeLabSales(labs, products, proformas, { includeUnassigned: true });
  const summary = summarizeLabSales(rows);
  const productRows = computeLabProductSales(labs, products, proformas);
  return { wb: buildLabSalesWorkbook(rows, summary, productRows, meta), rows };
}
function aoa(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
}

describe("Export ranking de laboratorios", () => {
  it("11. genera las 3 hojas requeridas", () => {
    const { wb } = workbook();
    expect(wb.SheetNames).toEqual(["Resumen", "Ranking laboratorios", "Productos por laboratorio"]);
  });

  it("la hoja Ranking trae ranking ordenado con total, unidades y % vs líder", () => {
    const { wb } = workbook();
    const data = aoa(wb.Sheets["Ranking laboratorios"]!);
    expect(data[0]).toEqual([
      "Ranking", "Laboratorio", "País", "Total vendido", "Unidades",
      "Transacciones", "Productos vendidos", "% vs líder",
    ]);
    // ISDIN líder (5000), Avène (1000)
    expect(data[1]![1]).toBe("ISDIN");
    expect(data[1]![3]).toBe(5000);
    expect(data[1]![4]).toBe(5); // unidades 3+2
    expect(data[2]![1]).toBe("Avène");
    expect(data[2]![3]).toBe(1000);
  });

  it("la hoja Resumen muestra líder y ventas acumuladas", () => {
    const { wb } = workbook();
    const flat = JSON.stringify(aoa(wb.Sheets["Resumen"]!));
    expect(flat).toContain("ISDIN"); // líder
    expect(flat).toContain("Ventas acumuladas");
  });

  it("la hoja Productos por laboratorio lista producto/SKU/unidades/total", () => {
    const { wb } = workbook();
    const data = aoa(wb.Sheets["Productos por laboratorio"]!);
    expect(data[0]).toEqual(["Laboratorio", "Producto", "SKU", "Unidades", "Total vendido"]);
    const flat = JSON.stringify(data);
    expect(flat).toContain("Crema A");
    expect(flat).toContain("SKU1");
  });

  it("aplica formato RD$ al total vendido", () => {
    const { wb } = workbook();
    expect(wb.Sheets["Ranking laboratorios"]!["D2"]?.z).toBe('"RD$"#,##0.00');
  });

  it("12. CSV incluye encabezado y una fila por laboratorio", () => {
    const { rows } = workbook();
    const csv = buildLabSalesCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Ranking");
    expect(lines[0]).toContain("% vs líder");
    expect(csv).toContain("ISDIN");
    expect(csv).toContain("Avène");
  });

  it("13. no expone UUIDs ni ids internos", () => {
    const { wb } = workbook();
    const dump = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n]!)).join("\n");
    expect(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(dump)).toBe(false);
    expect(dump).not.toContain("lab_a");
    expect(dump).not.toContain("p1");
    expect(dump).not.toContain("br1");
  });

  it("nombre de archivo seguro", () => {
    expect(labSalesFilename("xlsx", "2026-07-01")).toBe("Ranking-laboratorios-2026-07-01.xlsx");
    expect(labSalesFilename("csv", "2026-07-01")).toBe("Ranking-laboratorios-2026-07-01.csv");
  });
});
