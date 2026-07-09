import { describe, it, expect } from "vitest";
import { buildProductsWorkbookSpec, type ProductsWorkbookInput } from "./products-report-excel";
import type { Product } from "@/types";

function makeProduct(over: Partial<Product>): Product {
  return {
    id: "p1",
    businessId: "biz",
    sku: "DERM-000001",
    name: "Producto",
    unit: "unidad",
    requiresPrescription: false,
    controlled: false,
    cost: 1000,
    price: 1534,
    itbisRate: 18,
    minStock: 0,
    maxStock: 0,
    active: true,
    sellable: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const meta = {
  title: "Reporte de productos",
  subtitle: "test",
  rangeLabel: "Todo",
  branchLabel: "Todas",
  filtersLabel: "—",
  generatedBy: "Tester",
  generatedAtLabel: "2026-01-01",
};

function inputWith(products: Product[]): ProductsWorkbookInput {
  return {
    products,
    top: [],
    lowRotation: [],
    stockByProduct: new Map(),
    brandName: () => "Sin marca",
    categoryName: () => "Sin categoría",
    laboratoryName: () => "Sin laboratorio",
  };
}

describe("buildProductsWorkbookSpec — catálogo con márgenes (17/18)", () => {
  const spec = buildProductsWorkbookSpec(
    inputWith([makeProduct({ cost: 1000, itbisRate: 18, price: 1534 })]),
    meta,
  );
  const catalogo = spec.sheets.find((s) => s.name === "Catálogo")!;
  const table = catalogo.tables![0]!;
  const headers = table.columns.map((c) => c.header);
  const row = table.rows[0]!;

  it("incluye columnas de costo, ITBIS, precio, margen real y utilidad", () => {
    expect(headers).toEqual(
      expect.arrayContaining([
        "Costo por unidad",
        "ITBIS %",
        "Costo con ITBIS",
        "Precio venta",
        "Margen real",
        "Utilidad estimada",
      ]),
    );
  });

  it("CASO A: 1000 + 18% + precio 1534 ⇒ ITBIS 0.18, costo con ITBIS 1180, margen real 0.30, utilidad 354", () => {
    expect(row.cost).toBe(1000);
    expect(row.itbis).toBeCloseTo(0.18, 5); // percent 0-1 (arregla el bug de 1800%)
    expect(row.costWithItbis).toBe(1180);
    expect(row.price).toBe(1534);
    expect(row.realMargin as number).toBeCloseTo(0.3, 5);
    expect(row.utility).toBe(354);
  });

  it("las columnas numéricas usan formatos reales (currency/percent), no texto", () => {
    const byKey = new Map(table.columns.map((c) => [c.key, c.format]));
    expect(byKey.get("cost")).toBe("currency");
    expect(byKey.get("itbis")).toBe("percent");
    expect(byKey.get("realMargin")).toBe("percent");
    expect(byKey.get("utility")).toBe("currency");
  });
});
