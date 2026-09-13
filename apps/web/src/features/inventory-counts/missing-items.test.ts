import { describe, it, expect } from "vitest";
import type { Product } from "@/types";
import type { CountSession } from "./scan-session-store";
import { missingCountItems, withMissingItems } from "./missing-items";

function product(p: Partial<Product>): Product {
  return {
    id: p.id ?? "p1",
    businessId: "biz",
    sku: p.sku ?? "SKU-1",
    barcode: p.barcode,
    name: p.name ?? "Crema",
    brandId: p.brandId,
    laboratoryId: p.laboratoryId,
    categoryId: p.categoryId,
    unit: "unidad",
    cost: 100,
    price: 200,
    itbisRate: 18,
    minStock: 0,
    maxStock: 0,
    active: true,
    sellable: true,
    createdAt: "",
    updatedAt: "",
  } as Product;
}

function session(s: Partial<CountSession>): CountSession {
  return {
    id: "pc_1",
    code: "INV-20260913-TEST",
    name: "Inventario",
    branchId: "br_1",
    type: "full",
    status: "in_progress",
    items: [],
    scans: [],
    createdAt: "",
    updatedAt: "",
    startedAt: "",
    ...s,
  };
}

const P1 = product({ id: "p1", sku: "SKU-1", name: "Crema A" });
const P2 = product({ id: "p2", sku: "SKU-2", name: "Crema B", categoryId: "cat_1" });
const P3 = product({ id: "p3", sku: "SKU-3", name: "Crema C", categoryId: "cat_2" });
const PRODUCTS = [P1, P2, P3];

const sysQty: Record<string, number> = { p1: 5, p2: 3, p3: 0 };
const systemQuantityFor = (id: string) => sysQty[id] ?? 0;

describe("missingCountItems", () => {
  it("incluye productos con stock de sistema que nunca se escanearon", () => {
    const s = session({ items: [] });
    const missing = missingCountItems(s, PRODUCTS, systemQuantityFor);
    expect(missing.map((m) => m.productId).sort()).toEqual(["p1", "p2"]);
  });

  it("excluye productos con stock de sistema 0 (nada que documentar como faltante)", () => {
    const s = session({ items: [] });
    const missing = missingCountItems(s, PRODUCTS, systemQuantityFor);
    expect(missing.find((m) => m.productId === "p3")).toBeUndefined();
  });

  it("excluye productos ya escaneados o agregados a mano", () => {
    const s = session({
      items: [
        { productId: "p1", sku: "SKU-1", productName: "Crema A", countedQuantity: 5, lastScannedAt: "t" },
      ],
    });
    const missing = missingCountItems(s, PRODUCTS, systemQuantityFor);
    expect(missing.map((m) => m.productId)).toEqual(["p2"]);
  });

  it("respeta el filtro de categoría del conteo (alcance)", () => {
    const s = session({ items: [], categoryId: "cat_1" });
    const missing = missingCountItems(s, PRODUCTS, systemQuantityFor);
    // p1 no tiene categoryId (no matchea cat_1); p3 es cat_2 y además stock 0.
    expect(missing.map((m) => m.productId)).toEqual(["p2"]);
  });

  it("un spot check no marca nada como faltante (es una muestra, no un barrido)", () => {
    const s = session({ items: [], type: "spot" });
    expect(missingCountItems(s, PRODUCTS, systemQuantityFor)).toEqual([]);
  });

  it("un parcial SIN categoría/marca/laboratorio no marca nada (alcance indefinido)", () => {
    const s = session({ items: [], type: "partial" });
    expect(missingCountItems(s, PRODUCTS, systemQuantityFor)).toEqual([]);
  });

  it("un parcial CON categoría sí infiere faltantes dentro de esa categoría", () => {
    const s = session({ items: [], type: "partial", categoryId: "cat_1" });
    const missing = missingCountItems(s, PRODUCTS, systemQuantityFor);
    expect(missing.map((m) => m.productId)).toEqual(["p2"]);
  });

  it("las filas faltantes quedan con cantidad contada 0", () => {
    const s = session({ items: [] });
    const missing = missingCountItems(s, PRODUCTS, systemQuantityFor);
    expect(missing.every((m) => m.countedQuantity === 0)).toBe(true);
  });
});

describe("withMissingItems", () => {
  it("mezcla lo escaneado con lo faltante sin duplicar", () => {
    const s = session({
      items: [
        { productId: "p1", sku: "SKU-1", productName: "Crema A", countedQuantity: 5, lastScannedAt: "t" },
      ],
    });
    const all = withMissingItems(s, PRODUCTS, systemQuantityFor);
    expect(all.map((i) => i.productId).sort()).toEqual(["p1", "p2"]);
    expect(all.find((i) => i.productId === "p1")?.countedQuantity).toBe(5);
    expect(all.find((i) => i.productId === "p2")?.countedQuantity).toBe(0);
  });
});
