import { describe, expect, it } from "vitest";
import { inventoryRowForBranch } from "./lot-store";
import type { ProductLot } from "@/types";

const P = "prod-1";
const CUTIS = "0a1fd664-ea36-4df0-8634-902eb293a021";
const PRINCIPAL = "00000000-0000-0000-0000-00000000b001";

function lot(over: Partial<ProductLot>): ProductLot {
  return {
    id: Math.random().toString(36).slice(2),
    businessId: "biz",
    branchId: PRINCIPAL,
    productId: P,
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

describe("inventoryRowForBranch — motor único de Stock actual", () => {
  it("suma SOLO lotes vendibles de la sucursal y calcula valor", () => {
    const lots = [
      lot({ branchId: PRINCIPAL, currentQuantity: 30, unitCost: 10 }),
      lot({ branchId: PRINCIPAL, currentQuantity: 100, unitCost: 5 }),
      lot({ branchId: CUTIS, currentQuantity: 999, unitCost: 1 }), // otra sucursal
    ];
    const r = inventoryRowForBranch(lots, P, PRINCIPAL);
    expect(r.sellableStock).toBe(130);
    expect(r.value).toBe(30 * 10 + 100 * 5); // 800
    expect(r.lotCount).toBe(2);
    expect(r.totalLotCount).toBe(2);
  });

  it("excluye vencidos / cuarentena / recall del stock vendible, pero marca alertas", () => {
    const lots = [
      lot({ currentQuantity: 50 }), // vendible
      lot({ currentQuantity: 40, status: "quarantine" }),
      lot({ currentQuantity: 30, status: "recalled" }),
      lot({ currentQuantity: 20, expiresAt: "2020-01-01" }), // vencido por fecha
    ];
    const r = inventoryRowForBranch(lots, P, PRINCIPAL);
    expect(r.sellableStock).toBe(50);
    expect(r.quarantine).toBe(true);
    expect(r.recalled).toBe(true);
    expect(r.expired).toBe(true);
    expect(r.lotCount).toBe(1);
    expect(r.totalLotCount).toBe(4);
  });

  it("ignora lotes con cantidad 0", () => {
    const r = inventoryRowForBranch([lot({ currentQuantity: 0 })], P, PRINCIPAL);
    expect(r.sellableStock).toBe(0);
    expect(r.lotCount).toBe(0);
  });

  it("branchId vacío suma todas las sucursales (vista global)", () => {
    const lots = [
      lot({ branchId: PRINCIPAL, currentQuantity: 30 }),
      lot({ branchId: CUTIS, currentQuantity: 10 }),
    ];
    expect(inventoryRowForBranch(lots, P, "").sellableStock).toBe(40);
  });
});
