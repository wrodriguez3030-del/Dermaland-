import { describe, expect, it } from "vitest";
import {
  getSellableStockForBranch,
  getInventoryRows,
  getInventoryStockSummary,
  getNextSellableLotFEFO,
} from "./inventory-stock-engine";
import type { Product, ProductLot } from "@/types";

const P_ID = "057ebf75-6202-4155-8551-d614b71aca20"; // A-derma
const CUTIS = "0a1fd664-ea36-4df0-8634-902eb293a021";
const PRINCIPAL = "00000000-0000-0000-0000-00000000b001";

function lot(over: Partial<ProductLot>): ProductLot {
  return {
    id: Math.random().toString(36).slice(2),
    businessId: "biz",
    branchId: CUTIS,
    productId: P_ID,
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

const aderma = {
  id: P_ID,
  name: "A-derma Crema DE Ducha Hidratante 500 ML",
  sku: "DERM-I000590",
  minStock: 5,
  maxStock: 100,
} as unknown as Product;

// Escenario real: 1000 en Cutis, 130 en Principal.
const LOTS: ProductLot[] = [
  lot({ branchId: CUTIS, lotNumber: "asdfasd", currentQuantity: 1000, unitCost: 8 }),
  lot({ branchId: PRINCIPAL, lotNumber: "INIT", currentQuantity: 30, unitCost: 10 }),
  lot({ branchId: PRINCIPAL, lotNumber: "tfdgsdfg", currentQuantity: 100, unitCost: 5 }),
];

describe("motor único de stock — Inventario == Productos == POS", () => {
  it("Productos/POS (getSellableStockForBranch) e Inventario (getInventoryRows) coinciden en Cutis", () => {
    // Lo que muestran Productos/POS:
    const posStock = getSellableStockForBranch(LOTS, P_ID, CUTIS);
    expect(posStock).toBe(1000);

    // Lo que muestra Inventario > Stock actual:
    const rows = getInventoryRows(LOTS, [aderma], CUTIS);
    const invStock = rows[0]!.inv.sellableStock;

    // MISMA verdad de stock:
    expect(invStock).toBe(posStock);
    expect(invStock).toBe(1000);
  });

  it("coinciden también en Principal (130)", () => {
    expect(getSellableStockForBranch(LOTS, P_ID, PRINCIPAL)).toBe(130);
    expect(getInventoryRows(LOTS, [aderma], PRINCIPAL)[0]!.inv.sellableStock).toBe(130);
  });

  it("getInventoryRows suma current_quantity por branch_id (no usa otra tabla)", () => {
    const row = getInventoryRows(LOTS, [aderma], CUTIS)[0]!;
    expect(row.inv.sellableStock).toBe(1000);
    expect(row.inv.value).toBe(1000 * 8);
    expect(row.inv.lotCount).toBe(1);
  });

  it("getInventoryStockSummary: unidades, valor, bajo mínimo y sin stock", () => {
    const rows = getInventoryRows(LOTS, [aderma], CUTIS);
    const s = getInventoryStockSummary(rows);
    expect(s.totalUnits).toBe(1000);
    expect(s.totalValue).toBe(8000);
    expect(s.lowStockCount).toBe(0); // 1000 > minStock 5
    expect(s.noStockCount).toBe(0);
  });

  it("producto sin lotes en la sucursal → 0 (sin stock), no rompe", () => {
    const rows = getInventoryRows([], [aderma], CUTIS);
    expect(rows[0]!.inv.sellableStock).toBe(0);
    const s = getInventoryStockSummary(rows);
    expect(s.noStockCount).toBe(1);
    expect(s.lowStockCount).toBe(1); // 0 <= minStock
  });

  it("FEFO devuelve el lote vendible más próximo a vencer en la sucursal", () => {
    const fefo = getNextSellableLotFEFO(LOTS, P_ID, PRINCIPAL);
    expect(fefo).not.toBeNull();
    // De Principal: INIT (2027) y tfdgsdfg (2027-12-31) — el más próximo primero.
    expect(["INIT", "tfdgsdfg"]).toContain(fefo!.lotNumber);
  });
});
