import { describe, it, expect } from "vitest";
import type { ProductLot } from "@/types";
import {
  getSellableLotForProduct,
  nextFefoLotForBranch,
} from "./lot-store";

const BR = "br1";
const ACTIVE = new Set([BR]);

function lot(p: Partial<ProductLot>): ProductLot {
  return {
    id: p.id ?? "l",
    businessId: "biz",
    branchId: p.branchId ?? BR,
    productId: p.productId ?? "p1",
    warehouseId: "wh1",
    lotNumber: p.lotNumber ?? "L",
    expiresAt: p.expiresAt ?? "2030-12-31",
    initialQuantity: p.currentQuantity ?? 10,
    currentQuantity: p.currentQuantity ?? 10,
    unitCost: 100,
    status: p.status ?? "available",
    createdAt: "",
    updatedAt: "",
  } as ProductLot;
}

describe("FEFO — getSellableLotForProduct", () => {
  it("1. con lote vencido + lote vigente vende el vigente (y avisa que hay vencidos)", () => {
    const lots = [
      lot({ id: "expirado", expiresAt: "2020-01-01", currentQuantity: 5 }),
      lot({ id: "vigente", expiresAt: "2030-06-01", currentQuantity: 28 }),
    ];
    const r = getSellableLotForProduct(lots, "p1", BR, ACTIVE);
    expect(r.lot?.id).toBe("vigente");
    if (r.lot) expect(r.hasExpiredLots).toBe(true);
  });

  it("2. con varios lotes vigentes usa FEFO (vencimiento más próximo)", () => {
    const lots = [
      lot({ id: "tarde", expiresAt: "2031-01-01" }),
      lot({ id: "pronto", expiresAt: "2030-02-01" }),
      lot({ id: "medio", expiresAt: "2030-08-01" }),
    ];
    expect(getSellableLotForProduct(lots, "p1", BR, ACTIVE).lot?.id).toBe("pronto");
    expect(nextFefoLotForBranch(lots, "p1", BR)?.id).toBe("pronto");
  });

  it("3. con TODOS los lotes vencidos bloquea con razón 'expired'", () => {
    const lots = [
      lot({ id: "e1", expiresAt: "2020-01-01" }),
      lot({ id: "e2", expiresAt: "2019-06-01" }),
    ];
    const r = getSellableLotForProduct(lots, "p1", BR, ACTIVE);
    expect(r.lot).toBeNull();
    if (!r.lot) expect(r.reason).toBe("expired");
  });

  it("4. lote en cuarentena (sin vendible) bloquea con razón 'quarantine'", () => {
    const lots = [lot({ id: "q", status: "quarantine" })];
    const r = getSellableLotForProduct(lots, "p1", BR, ACTIVE);
    expect(r.lot).toBeNull();
    if (!r.lot) expect(r.reason).toBe("quarantine");
  });

  it("5. lote en recall (sin vendible) bloquea con razón 'recall'", () => {
    const lots = [lot({ id: "r", status: "recalled" })];
    const r = getSellableLotForProduct(lots, "p1", BR, ACTIVE);
    expect(r.lot).toBeNull();
    if (!r.lot) expect(r.reason).toBe("recall");
  });

  it("cuarentena + vigente vende el vigente (no bloquea)", () => {
    const lots = [
      lot({ id: "q", status: "quarantine", currentQuantity: 3 }),
      lot({ id: "ok", expiresAt: "2030-05-01", currentQuantity: 12 }),
    ];
    expect(getSellableLotForProduct(lots, "p1", BR, ACTIVE).lot?.id).toBe("ok");
  });

  it("sin cantidad (todos agotados) bloquea con razón 'depleted'", () => {
    const lots = [lot({ id: "z", currentQuantity: 0 })];
    const r = getSellableLotForProduct(lots, "p1", BR, ACTIVE);
    expect(r.lot).toBeNull();
    if (!r.lot) expect(r.reason).toBe("depleted");
  });
});
