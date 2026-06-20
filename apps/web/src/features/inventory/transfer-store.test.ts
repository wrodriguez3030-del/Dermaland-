// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  createTransfer,
  getTransfer,
  listTransfers,
  validateTransfer,
  clearLocalTransfers,
} from "./transfer-store";
import {
  availableStock,
  clearLocalInventory,
  listLotsByProduct,
  listMovementsByProduct,
} from "./lot-store";
import { mockBusiness } from "@/lib/mock-data/tenancy";

// Lote seed: lot_lrp_001a (prod_lrp_001, 18 u disponibles, br_santiago).
const ORIGIN_BRANCH = "br_santiago";
const DEST_BRANCH = "br_sd_naco";
const DEST_WH = "wh_naco_main"; // almacén default interno de Naco
const LOT = "lot_lrp_001a";
const PID = "prod_lrp_001";

beforeEach(() => {
  window.localStorage.clear();
  clearLocalInventory();
  clearLocalTransfers();
});

function validInput(qty = 10) {
  return {
    originBranchId: ORIGIN_BRANCH,
    destinationBranchId: DEST_BRANCH,
    transferDate: "2026-06-17",
    notes: "Reabastecer Naco",
    items: [{ lotId: LOT, productId: PID, quantity: qty }],
  };
}

describe("validateTransfer", () => {
  it("origen y destino no pueden ser iguales", () => {
    const err = validateTransfer({
      ...validInput(),
      destinationBranchId: ORIGIN_BRANCH,
    });
    expect(err).toMatch(/no pueden ser iguales/i);
  });
  it("exige al menos un producto", () => {
    expect(validateTransfer({ ...validInput(), items: [] })).toMatch(/al menos un/i);
  });
  it("no permite transferir más que el stock disponible", () => {
    expect(validateTransfer(validInput(9999))).toMatch(/supera el stock/i);
  });
});

describe("createTransfer", () => {
  it("crea transferencia válida: descuenta origen, suma destino, conserva lote y vencimiento", () => {
    const originBefore = listLotsByProduct(PID).find((l) => l.id === LOT)!;
    const totalBefore = availableStock(PID);

    const r = createTransfer(validInput(10));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Origen descontado.
    const originAfter = listLotsByProduct(PID).find((l) => l.id === LOT)!;
    expect(originAfter.currentQuantity).toBe(originBefore.currentQuantity - 10);

    // Lote destino creado en el almacén destino, conservando lote + vencimiento.
    const destLot = listLotsByProduct(PID).find(
      (l) => l.warehouseId === DEST_WH && l.lotNumber === originBefore.lotNumber,
    );
    expect(destLot).toBeDefined();
    expect(destLot!.currentQuantity).toBe(10);
    expect(destLot!.expiresAt).toBe(originBefore.expiresAt);

    // Stock total disponible se conserva (sólo se movió de almacén).
    expect(availableStock(PID)).toBe(totalBefore);
  });

  it("registra movimientos transfer_out y transfer_in con la misma referencia", () => {
    const r = createTransfer(validInput(5));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const moves = listMovementsByProduct(PID).filter(
      (m) => m.reference === r.transfer.transferNumber,
    );
    const out = moves.find((m) => m.type === "transfer_out");
    const inn = moves.find((m) => m.type === "transfer_in");
    expect(out?.quantity).toBe(-5);
    expect(inn?.quantity).toBe(5);
  });

  it("guarda la transferencia en el historial y se puede ver el detalle", () => {
    const r = createTransfer(validInput(7));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(listTransfers()).toHaveLength(1);
    const t = getTransfer(r.transfer.id);
    expect(t).toBeDefined();
    expect(t!.totalQuantity).toBe(7);
    expect(t!.status).toBe("completed");
    expect(t!.items).toHaveLength(1);
  });

  it("scoping single-business: la transferencia y sus ítems llevan el business_id del negocio", () => {
    const r = createTransfer(validInput(3));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transfer.businessId).toBe(mockBusiness.id);
    expect(r.transfer.items.every((i) => i.businessId === mockBusiness.id)).toBe(true);
  });
});
