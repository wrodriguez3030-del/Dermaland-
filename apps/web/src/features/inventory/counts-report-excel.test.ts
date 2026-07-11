import { describe, it, expect } from "vitest";
import {
  buildCountsWorkbookSpec,
  type CountsReportLookups,
} from "./counts-report-excel";
import type { InventoryCount, InventoryCountItem } from "@/types";

const counts = [
  {
    id: "c1",
    countNumber: "CONT-1",
    branchId: "br1",
    status: "approved",
    countType: "full",
    scanCount: 3,
    itemCount: 2,
    startedAt: "2026-07-01T09:00:00Z",
    approvedAt: "2026-07-01T12:00:00Z",
  },
] as unknown as InventoryCount[];

const items = [
  {
    id: "i1",
    inventoryCountId: "c1",
    productId: "p1",
    productSku: "SKU-1",
    productName: "Crema A",
    lotNumber: "L-1",
    expiresAt: "2026-12-31",
    warehouseId: "w1",
    expectedQuantity: 10,
    countedQuantity: 8,
    differenceQuantity: -2,
    status: "shortage",
  },
  {
    id: "i2",
    inventoryCountId: "c1",
    productId: "p2",
    productSku: "SKU-2",
    productName: "Crema B",
    lotNumber: "L-2",
    expiresAt: "2027-01-15",
    warehouseId: "w1",
    expectedQuantity: 5,
    countedQuantity: 5,
    differenceQuantity: 0,
    status: "match",
  },
] as unknown as InventoryCountItem[];

const lookups: CountsReportLookups = {
  branchName: (id) => (id === "br1" ? "Santiago" : ""),
  product: (id) =>
    id === "p1"
      ? { brandId: "b1", laboratoryId: "l1", categoryId: "cat1", barcode: "8400001" }
      : { brandId: "b2", laboratoryId: "l2", categoryId: "cat2", barcode: "8400002" },
  brandName: (id) => (id === "b1" ? "MarcaUno" : "MarcaDos"),
  labName: (id) => (id === "l1" ? "LabUno" : "LabDos"),
  categoryName: (id) => (id === "cat1" ? "CatUno" : "CatDos"),
};

const meta = {
  title: "Reporte de inventario físico",
  rangeLabel: "Historial",
  branchLabel: "Todas",
  filtersLabel: "Sin filtros",
  generatedBy: "Tester",
  generatedAtLabel: "01/07/2026",
};

/** Primera tabla de una hoja del workbook (con aserción para el test). */
function table(name: string) {
  const wb = buildCountsWorkbookSpec(counts, items, meta, lookups);
  const t = wb.sheets.find((x) => x.name === name)?.tables[0];
  if (!t) throw new Error(`Falta hoja/tabla ${name}`);
  return t;
}

describe("buildCountsWorkbookSpec — columnas enriquecidas", () => {
  it("la hoja Detalle incluye las columnas pedidas por el usuario", () => {
    const headers = table("Detalle").columns.map((c) => c.header);
    for (const h of [
      "SKU",
      "Código de barra",
      "Producto",
      "Laboratorio",
      "Marca",
      "Categoría",
      "Sucursal",
      "Lote",
      "Vencimiento",
    ]) {
      expect(headers).toContain(h);
    }
  });

  it("rellena marca, laboratorio, categoría, sucursal, código de barra y vencimiento", () => {
    const row = table("Detalle").rows.find((r) => r.sku === "SKU-1");
    expect(row).toBeDefined();
    expect(row!.brand).toBe("MarcaUno");
    expect(row!.laboratory).toBe("LabUno");
    expect(row!.category).toBe("CatUno");
    expect(row!.branch).toBe("Santiago"); // derivada del conteo (inventoryCountId → branchId)
    expect(row!.barcode).toBe("8400001");
    expect(row!.lot).toBe("L-1");
    expect(row!.expires).toBeInstanceOf(Date); // toExcelDate
  });

  it("la sucursal por ítem sale del conteo al que pertenece", () => {
    const rows = table("Detalle").rows;
    expect(rows.every((r) => r.branch === "Santiago")).toBe(true);
  });

  it("la hoja Diferencias solo trae ítems con diferencia y su total", () => {
    const diff = table("Diferencias");
    expect(diff.rows).toHaveLength(1); // solo i1 (shortage)
    expect(diff.rows[0]!.sku).toBe("SKU-1");
    expect(diff.totals?.diff).toBe(-2);
  });

  it("orden de columnas descriptivas alineado con el detalle (SKU, Código, Producto…)", () => {
    const headers = table("Detalle").columns.map((c) => c.header);
    expect(headers.slice(0, 8)).toEqual([
      "SKU",
      "Código de barra",
      "Producto",
      "Laboratorio",
      "Marca",
      "Categoría",
      "Sucursal",
      "Lote",
    ]);
  });
});
