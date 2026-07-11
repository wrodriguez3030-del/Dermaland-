import { describe, it, expect } from "vitest";
import {
  matchesInventorySearch,
  inventorySearchHaystack,
  type InventorySearchable,
} from "./inventory-search";

const row: InventorySearchable = {
  product: {
    name: "Isispharma Metroruboril AZ 30ML",
    sku: "DERM-I00725",
    barcode: "3760269770225",
  },
  brandName: "Isispharma",
  categoryName: "Dermocosmética",
  labName: "Isispharma Lab",
  lotNumbers: "L-2401 L-2402",
};

describe("matchesInventorySearch", () => {
  it("encuentra por CÓDIGO DE BARRA completo (regresión: antes no funcionaba)", () => {
    expect(matchesInventorySearch(row, "3760269770225")).toBe(true);
  });

  it("encuentra por barcode parcial", () => {
    expect(matchesInventorySearch(row, "376026")).toBe(true);
  });

  it("sigue encontrando por nombre, SKU, marca y lote", () => {
    expect(matchesInventorySearch(row, "metroruboril")).toBe(true);
    expect(matchesInventorySearch(row, "DERM-I00725")).toBe(true);
    expect(matchesInventorySearch(row, "isispharma")).toBe(true);
    expect(matchesInventorySearch(row, "L-2402")).toBe(true);
  });

  it("es insensible a mayúsculas y espacios alrededor", () => {
    expect(matchesInventorySearch(row, "  3760269770225 ")).toBe(true);
    expect(matchesInventorySearch(row, "METRORUBORIL")).toBe(true);
  });

  it("término vacío coincide con todo", () => {
    expect(matchesInventorySearch(row, "")).toBe(true);
    expect(matchesInventorySearch(row, "   ")).toBe(true);
  });

  it("no coincide con texto ausente", () => {
    expect(matchesInventorySearch(row, "9999999999999")).toBe(false);
    expect(matchesInventorySearch(row, "eucerin")).toBe(false);
  });

  it("no rompe si el producto no tiene barcode", () => {
    const sinBarcode: InventorySearchable = {
      product: { name: "Producto X", sku: "SKU-1", barcode: undefined },
    };
    expect(matchesInventorySearch(sinBarcode, "producto")).toBe(true);
    expect(matchesInventorySearch(sinBarcode, "123")).toBe(false);
    expect(inventorySearchHaystack(sinBarcode)).toBe("producto x sku-1");
  });
});
