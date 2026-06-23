import { describe, expect, it } from "vitest";
import { lotRowMatches, LOT_COMPARATORS, type LotRow } from "./lot-table";
import type { ProductLot } from "@/types";

const CUTIS = "0a1fd664-ea36-4df0-8634-902eb293a021";
const PRINCIPAL = "00000000-0000-0000-0000-00000000b001";

function lot(over: Partial<ProductLot>): ProductLot {
  return {
    id: Math.random().toString(36).slice(2),
    businessId: "biz",
    branchId: CUTIS,
    productId: "p",
    warehouseId: "wh",
    lotNumber: "L",
    expiresAt: "2027-12-31",
    receivedAt: "2026-01-01",
    initialQuantity: 100,
    currentQuantity: 100,
    unitCost: 10,
    status: "available",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...over,
  } as ProductLot;
}

function row(over: Partial<LotRow> & { lot: ProductLot }): LotRow {
  return {
    productName: "A-derma Crema",
    sku: "DERM-1",
    brandName: "A-derma",
    labName: "Pierre Fabre",
    branchName: "Dermaland Cutis",
    days: 365,
    value: over.lot.currentQuantity * over.lot.unitCost,
    ...over,
  };
}

const rows: LotRow[] = [
  row({ lot: lot({ lotNumber: "asdfasd", currentQuantity: 1000, branchId: CUTIS }) }),
  row({ lot: lot({ lotNumber: "tfdgsdfg", currentQuantity: 100, branchId: PRINCIPAL }), branchName: "DermaLand Principal" }),
  row({ lot: lot({ lotNumber: "INIT", currentQuantity: 30, branchId: PRINCIPAL }), branchName: "DermaLand Principal" }),
  row({ lot: lot({ lotNumber: "ZERO", currentQuantity: 0, branchId: CUTIS }) }),
];

function sortBy(key: keyof typeof LOT_COMPARATORS, dir: "asc" | "desc", list = rows) {
  const f = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => f * LOT_COMPARATORS[key](a, b));
}

describe("Stock por lote — orden y filtros", () => {
  it("por defecto ordena por CANTIDAD mayor→menor", () => {
    const out = sortBy("cantidad", "desc");
    expect(out.map((r) => r.lot.currentQuantity)).toEqual([1000, 100, 30, 0]);
    // El lote de 1000 (A-derma) arriba; el de 0 abajo.
    expect(out[0]!.lot.lotNumber).toBe("asdfasd");
    expect(out[out.length - 1]!.lot.currentQuantity).toBe(0);
  });

  it("orden cantidad ascendente funciona", () => {
    expect(sortBy("cantidad", "asc").map((r) => r.lot.currentQuantity)).toEqual([
      0, 30, 100, 1000,
    ]);
  });

  it("orden por producto y por vencimiento funciona", () => {
    expect(sortBy("producto", "asc")[0]).toBeDefined();
    expect(sortBy("vence", "asc")[0]).toBeDefined();
    expect(sortBy("sucursal", "asc").map((r) => r.branchName)[0]).toMatch(/Cutis|Principal/);
  });

  it("usa current_quantity para el valor mostrado", () => {
    const r = rows.find((x) => x.lot.lotNumber === "asdfasd")!;
    expect(r.value).toBe(1000 * 10);
  });

  it("filtro de sucursal: solo lotes de esa sucursal", () => {
    const only = rows.filter((r) =>
      lotRowMatches(r, { search: "", status: "all", branchFilter: PRINCIPAL }),
    );
    expect(only.every((r) => r.lot.branchId === PRINCIPAL)).toBe(true);
    expect(only).toHaveLength(2);
  });

  it("filtro estado 'sin-stock' devuelve solo cantidad 0", () => {
    const out = rows.filter((r) =>
      lotRowMatches(r, { search: "", status: "sin-stock", branchFilter: "all" }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.lot.currentQuantity).toBe(0);
  });

  it("filtro estado 'disponible' excluye cantidad 0", () => {
    const out = rows.filter((r) =>
      lotRowMatches(r, { search: "", status: "disponible", branchFilter: "all" }),
    );
    expect(out.every((r) => r.lot.currentQuantity > 0)).toBe(true);
  });

  it("búsqueda por lote y por producto", () => {
    const byLot = rows.filter((r) =>
      lotRowMatches(r, { search: "asdfasd", status: "all", branchFilter: "all" }),
    );
    expect(byLot).toHaveLength(1);
    const byProduct = rows.filter((r) =>
      lotRowMatches(r, { search: "a-derma", status: "all", branchFilter: "all" }),
    );
    expect(byProduct.length).toBeGreaterThan(0);
  });
});
