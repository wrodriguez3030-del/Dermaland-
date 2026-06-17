// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  addLot,
  adjustStock,
  availableStock,
  clearLocalInventory,
  expiryStatus,
  listLotsByProduct,
  listMovementsByProduct,
  stockByBranch,
  validateLot,
} from "./lot-store";

const PID = "prod_test_inv";

function future(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

beforeEach(() => {
  window.localStorage.clear();
  clearLocalInventory();
});

describe("validateLot", () => {
  it("exige lote, sucursal, almacén, cantidad>0 y vencimiento", () => {
    const m = validateLot({}, true);
    expect(m).toEqual(
      expect.arrayContaining([
        "lotNumber",
        "branchId",
        "warehouseId",
        "initialQuantity",
        "expiresAt",
      ]),
    );
  });
  it("no exige vencimiento si requireExpiry=false", () => {
    const m = validateLot(
      {
        lotNumber: "L1",
        branchId: "br_santiago",
        warehouseId: "wh_stg_main",
        initialQuantity: 5,
      },
      false,
    );
    expect(m).toEqual([]);
  });
  it("rechaza cantidad 0 o negativa", () => {
    expect(validateLot({ initialQuantity: 0 } as never, false)).toContain(
      "initialQuantity",
    );
  });
});

describe("addLot", () => {
  it("crea lote disponible y suma stock + genera movimiento de entrada", () => {
    expect(availableStock(PID)).toBe(0);
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "TST-01",
      initialQuantity: 20,
      expiresAt: future(200),
      unitCost: 100,
    });
    expect(r.ok).toBe(true);
    expect(availableStock(PID)).toBe(20);
    expect(listLotsByProduct(PID)).toHaveLength(1);
    const moves = listMovementsByProduct(PID);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.type).toBe("entry_purchase");
    expect(moves[0]!.quantity).toBe(20);
  });

  it("falla sin fecha de vencimiento cuando es requerida", () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "TST-02",
      initialQuantity: 5,
      expiresAt: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missingFields).toContain("expiresAt");
  });
});

describe("adjustStock", () => {
  it("ajusta cantidad y registra movimiento con el delta correcto", () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "TST-03",
      initialQuantity: 10,
      expiresAt: future(100),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const adj = adjustStock({
      lotId: r.lot.id,
      productId: PID,
      warehouseId: "wh_stg_main",
      branchId: "br_santiago",
      newQuantity: 4,
      reason: "Conteo físico",
    });
    expect(adj.ok).toBe(true);
    if (adj.ok) expect(adj.delta).toBe(-6);
    expect(availableStock(PID)).toBe(4);
    const last = listMovementsByProduct(PID)[0]!;
    expect(last.type).toBe("adjustment_negative");
    expect(last.quantity).toBe(-6);
  });

  it("exige motivo", () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "TST-04",
      initialQuantity: 3,
      expiresAt: future(100),
    });
    if (!r.ok) throw new Error("setup");
    const adj = adjustStock({
      lotId: r.lot.id,
      productId: PID,
      warehouseId: "wh_stg_main",
      branchId: "br_santiago",
      newQuantity: 2,
      reason: "",
    });
    expect(adj.ok).toBe(false);
  });
});

describe("stockByBranch", () => {
  it("agrupa por sucursal+almacén", () => {
    addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "A",
      initialQuantity: 5,
      expiresAt: future(100),
    });
    addLot({
      productId: PID,
      branchId: "br_sd_naco",
      warehouseId: "wh_naco_main",
      lotNumber: "B",
      initialQuantity: 7,
      expiresAt: future(100),
    });
    const groups = stockByBranch(PID);
    expect(groups).toHaveLength(2);
    expect(groups.reduce((s, g) => s + g.available, 0)).toBe(12);
  });
});

describe("expiryStatus", () => {
  const ref = new Date("2026-06-17T00:00:00Z");
  it("clasifica vencido/pronto/aviso/ok", () => {
    expect(expiryStatus("2026-06-10T00:00:00Z", ref)).toBe("expired");
    expect(expiryStatus("2026-07-01T00:00:00Z", ref)).toBe("soon"); // 14 d
    expect(expiryStatus("2026-08-01T00:00:00Z", ref)).toBe("warn"); // ~45 d
    expect(expiryStatus("2027-01-01T00:00:00Z", ref)).toBe("ok");
  });
});

describe("producto sin lote", () => {
  it("no tiene lotes ni stock (UI debe mostrar 'Agregar primer lote')", () => {
    expect(listLotsByProduct("prod_sin_lote")).toHaveLength(0);
    expect(availableStock("prod_sin_lote")).toBe(0);
  });
});
