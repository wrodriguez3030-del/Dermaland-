import { describe, it, expect } from "vitest";
import { resolveTransferPrefill } from "./transfer-prefill";
import type { ProductLot } from "@/types";

function lot(
  id: string,
  productId: string,
  branchId: string,
  qty: number,
  expiresAt: string,
  status: ProductLot["status"] = "available",
): ProductLot {
  return {
    id,
    productId,
    branchId,
    warehouseId: "wh1",
    lotNumber: `L-${id}`,
    expiresAt,
    receivedAt: "2026-01-01",
    initialQuantity: qty,
    currentQuantity: qty,
    unitCost: 0,
    status,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as ProductLot;
}

describe("resolveTransferPrefill", () => {
  it("devuelve null si el producto no tiene lotes disponibles", () => {
    const lots = [lot("l1", "OTRO", "b1", 5, "2026-12-01")];
    expect(
      resolveTransferPrefill({ productId: "P", currentBranchId: "b1", lots }),
    ).toBeNull();
  });

  it("ignora lotes sin stock o no disponibles", () => {
    const lots = [
      lot("l1", "P", "b1", 0, "2026-12-01"),
      lot("l2", "P", "b1", 3, "2026-12-01", "quarantine"),
    ];
    expect(
      resolveTransferPrefill({ productId: "P", currentBranchId: "b1", lots }),
    ).toBeNull();
  });

  it("prefiere la sucursal actual cuando tiene stock", () => {
    const lots = [
      lot("l1", "P", "b1", 2, "2026-12-01"),
      lot("l2", "P", "b2", 50, "2026-12-01"),
    ];
    const r = resolveTransferPrefill({ productId: "P", currentBranchId: "b1", lots });
    expect(r).toEqual({ originBranchId: "b1", lotId: "l1" });
  });

  it("cae a la sucursal con mayor stock si la actual no tiene", () => {
    const lots = [
      lot("l1", "P", "b2", 4, "2026-12-01"),
      lot("l2", "P", "b3", 9, "2026-12-01"),
    ];
    const r = resolveTransferPrefill({ productId: "P", currentBranchId: "b1", lots });
    expect(r).toEqual({ originBranchId: "b3", lotId: "l2" });
  });

  it("elige el lote FEFO dentro de la sucursal elegida", () => {
    const lots = [
      lot("late", "P", "b1", 5, "2027-05-01"),
      lot("fefo", "P", "b1", 5, "2026-06-01"),
    ];
    const r = resolveTransferPrefill({ productId: "P", currentBranchId: "b1", lots });
    expect(r).toEqual({ originBranchId: "b1", lotId: "fefo" });
  });

  it("funciona sin sucursal actual (elige la de mayor stock)", () => {
    const lots = [
      lot("l1", "P", "b2", 4, "2026-12-01"),
      lot("l2", "P", "b3", 9, "2026-12-01"),
    ];
    const r = resolveTransferPrefill({ productId: "P", lots });
    expect(r).toEqual({ originBranchId: "b3", lotId: "l2" });
  });
});
