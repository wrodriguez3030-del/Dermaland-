// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  addLot,
  addLotAnywhere,
  adjustStock,
  adjustStockAnywhere,
  availableStock,
  clearLocalInventory,
  expiryStatus,
  listAllLots,
  listAllMovements,
  listLotsByProduct,
  listMovementsByProduct,
  LOT_BACKEND,
  lotBlockReason,
  nextFefoLotForBranch,
  quarantineLotAnywhere,
  quarantineLotLocal,
  recallLotAnywhere,
  recallLotLocal,
  releaseLotAnywhere,
  releaseLotLocal,
  sellableStockForBranch,
  stockByBranch,
  stockBranchSummary,
  stockByBranchForProduct,
  summarizeLotsByBranch,
  totalSellableStock,
  updateLotNoteLocal,
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

describe("stock por sucursal (sin mezclar entre sucursales)", () => {
  it("agrupa el stock por sucursal y no mezcla cantidades", () => {
    addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "S1",
      initialQuantity: 8,
      expiresAt: future(120),
    });
    addLot({
      productId: PID,
      branchId: "br_sd_naco",
      warehouseId: "wh_naco_main",
      lotNumber: "N1",
      initialQuantity: 5,
      expiresAt: future(120),
    });
    const summary = stockBranchSummary(PID);
    const stg = summary.find((g) => g.branchId === "br_santiago")!;
    const naco = summary.find((g) => g.branchId === "br_sd_naco")!;
    expect(stg.available).toBe(8);
    expect(naco.available).toBe(5);
    // El total disponible es la suma de ambas sucursales.
    expect(availableStock(PID)).toBe(13);
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

// ─── Capa cliente gated (LOT_BACKEND, addLotAnywhere, adjustStockAnywhere, summarizeLotsByBranch) ───

describe("LOT_BACKEND", () => {
  it('es "local" cuando NEXT_PUBLIC_DATA_SOURCE no es supabase', () => {
    expect(LOT_BACKEND).toBe("local");
  });
});

describe("addLotAnywhere (modo local)", () => {
  it("agrega lote al store local y aparece en listLotsByProduct", async () => {
    const r = await addLotAnywhere({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "ANY-01",
      initialQuantity: 15,
      expiresAt: future(180),
      unitCost: 50,
    });
    expect(r.ok).toBe(true);
    const lots = listLotsByProduct(PID);
    expect(lots.some((l) => l.lotNumber === "ANY-01")).toBe(true);
    expect(availableStock(PID)).toBeGreaterThanOrEqual(15);
  });

  it("falla sin campos requeridos", async () => {
    const r = await addLotAnywhere({
      productId: PID,
      branchId: "",
      warehouseId: "",
      lotNumber: "",
      initialQuantity: 0,
      expiresAt: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missingFields?.length).toBeGreaterThan(0);
  });
});

describe("adjustStockAnywhere (modo local)", () => {
  it("ajusta la cantidad del lote via el wrapper", async () => {
    const add = await addLotAnywhere({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "ANY-02",
      initialQuantity: 10,
      expiresAt: future(180),
    });
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    const adj = await adjustStockAnywhere({
      lotId: add.lot.id,
      productId: PID,
      warehouseId: "wh_stg_main",
      branchId: "br_santiago",
      newQuantity: 7,
      reason: "Conteo físico",
    });
    expect(adj.ok).toBe(true);
    expect(availableStock(PID)).toBe(7);
  });

  it("falla sin motivo", async () => {
    const add = await addLotAnywhere({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "ANY-03",
      initialQuantity: 5,
      expiresAt: future(180),
    });
    if (!add.ok) throw new Error("setup");
    const adj = await adjustStockAnywhere({
      lotId: add.lot.id,
      productId: PID,
      warehouseId: "wh_stg_main",
      branchId: "br_santiago",
      newQuantity: 3,
      reason: "",
    });
    expect(adj.ok).toBe(false);
  });
});

describe("summarizeLotsByBranch", () => {
  it("agrupa lotes por sucursal con conteo de available y expired", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const lots = [
      {
        id: "lot_a",
        businessId: "biz_1",
        branchId: "br_santiago",
        productId: PID,
        warehouseId: "wh_1",
        lotNumber: "A",
        expiresAt: future(200),
        receivedAt: new Date().toISOString(),
        initialQuantity: 10,
        currentQuantity: 10,
        unitCost: 0,
        status: "available" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "lot_b",
        businessId: "biz_1",
        branchId: "br_santiago",
        productId: PID,
        warehouseId: "wh_1",
        lotNumber: "B",
        expiresAt: past.toISOString(),
        receivedAt: new Date().toISOString(),
        initialQuantity: 5,
        currentQuantity: 5,
        unitCost: 0,
        status: "available" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const summary = summarizeLotsByBranch(lots);
    expect(summary).toHaveLength(1);
    const stg = summary[0]!;
    expect(stg.branchId).toBe("br_santiago");
    expect(stg.lots).toBe(2);
    expect(stg.available).toBe(15); // both are "available" status
    expect(stg.expired).toBe(1);
    expect(stg.soon).toBe(0);
  });

  it("devuelve array vacío para lista vacía", () => {
    expect(summarizeLotsByBranch([])).toEqual([]);
  });
});

// ─── Cuarentena: release / recall / updateNote ────────────────────────────────

describe("releaseLotLocal", () => {
  function addQuarantineLot(): string {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "QT-01",
      initialQuantity: 10,
      expiresAt: future(180),
    });
    if (!r.ok) throw new Error("setup: addLot failed");
    // Forzar status quarantine via localStorage key (simula estado inicial)
    const key = "dermaland.lots.status";
    const ov = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, string>;
    ov[r.lot.id] = "quarantine";
    window.localStorage.setItem(key, JSON.stringify(ov));
    return r.lot.id;
  }

  it("rechaza sin motivo", () => {
    const lotId = addQuarantineLot();
    const res = releaseLotLocal(lotId, "");
    expect(res.ok).toBe(false);
  });

  it("libera lote y cambia status a available", () => {
    const lotId = addQuarantineLot();
    const res = releaseLotLocal(lotId, "Revisión OK");
    expect(res.ok).toBe(true);
    const lot = listAllLots().find((l) => l.id === lotId);
    expect(lot?.status).toBe("available");
  });

  it("registra movimiento de liberación", () => {
    const lotId = addQuarantineLot();
    releaseLotLocal(lotId, "Revisión OK");
    const moves = listMovementsByProduct(PID);
    const relMove = moves.find((m) => m.type === "release");
    expect(relMove).toBeDefined();
    expect(relMove?.reason).toContain("Revisión OK");
  });
});

describe("recallLotLocal", () => {
  function addAvailableLot(): string {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "RC-01",
      initialQuantity: 5,
      expiresAt: future(200),
    });
    if (!r.ok) throw new Error("setup: addLot failed");
    return r.lot.id;
  }

  it("rechaza sin motivo", () => {
    const lotId = addAvailableLot();
    const res = recallLotLocal(lotId, "");
    expect(res.ok).toBe(false);
  });

  it("envía lote a recalled y registra movimiento", () => {
    const lotId = addAvailableLot();
    const res = recallLotLocal(lotId, "Contaminación detectada");
    expect(res.ok).toBe(true);
    const lot = listAllLots().find((l) => l.id === lotId);
    expect(lot?.status).toBe("recalled");
    const moves = listMovementsByProduct(PID);
    const recallMove = moves.find((m) => m.reason?.includes("Contaminación"));
    expect(recallMove).toBeDefined();
  });
});

describe("updateLotNoteLocal", () => {
  it("actualiza la nota del lote sin cambiar status", () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "NOTE-01",
      initialQuantity: 3,
      expiresAt: future(90),
    });
    if (!r.ok) throw new Error("setup");
    updateLotNoteLocal(r.lot.id, "Nuevo motivo de cuarentena");
    const lot = listAllLots().find((l) => l.id === r.lot.id);
    expect(lot?.notes).toBe("Nuevo motivo de cuarentena");
    expect(lot?.status).toBe("available");
  });
});

describe("quarantineLotLocal", () => {
  function addAvailableLot(lotNumber = "QTN-01"): string {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber,
      initialQuantity: 10,
      expiresAt: future(180),
    });
    if (!r.ok) throw new Error("setup: addLot failed");
    return r.lot.id;
  }

  it("rechaza sin motivo", () => {
    const lotId = addAvailableLot();
    const res = quarantineLotLocal(lotId, "");
    expect(res.ok).toBe(false);
  });

  it("cambia status a quarantine", () => {
    const lotId = addAvailableLot("QTN-02");
    const res = quarantineLotLocal(lotId, "Temperatura fuera de rango");
    expect(res.ok).toBe(true);
    const lot = listAllLots().find((l) => l.id === lotId);
    expect(lot?.status).toBe("quarantine");
  });

  it("registra movimiento tipo quarantine", () => {
    const lotId = addAvailableLot("QTN-03");
    quarantineLotLocal(lotId, "Daño en embalaje");
    const moves = listMovementsByProduct(PID);
    const qMove = moves.find((m) => m.type === "quarantine");
    expect(qMove).toBeDefined();
    expect(qMove?.reason).toContain("Daño en embalaje");
  });

  it("un lote en cuarentena no es vendible (sellableStockForBranch = 0)", () => {
    const lotId = addAvailableLot("QTN-04");
    quarantineLotLocal(lotId, "Sospecha contaminación");
    const lots = listAllLots();
    const sellable = sellableStockForBranch(lots, PID, "br_santiago");
    expect(sellable).toBe(0);
  });

  it("un lote en cuarentena tiene lotBlockReason quarantine", () => {
    const lotId = addAvailableLot("QTN-05");
    quarantineLotLocal(lotId, "Control de calidad");
    const lots = listAllLots();
    expect(lotBlockReason(lots, PID, "br_santiago")).toBe("quarantine");
  });

  it("liberar un lote en cuarentena lo vuelve available y vendible", () => {
    const lotId = addAvailableLot("QTN-06");
    quarantineLotLocal(lotId, "Sospecha inicial");
    releaseLotLocal(lotId, "Revisión negativa — OK para venta");
    const lots = listAllLots();
    const lot = lots.find((l) => l.id === lotId);
    expect(lot?.status).toBe("available");
    expect(sellableStockForBranch(lots, PID, "br_santiago")).toBeGreaterThan(0);
  });

  it("recall de un lote lo marca recalled", () => {
    const lotId = addAvailableLot("QTN-07");
    recallLotLocal(lotId, "Defecto de fabricación confirmado");
    const lot = listAllLots().find((l) => l.id === lotId);
    expect(lot?.status).toBe("recalled");
    const lots = listAllLots();
    expect(lotBlockReason(lots, PID, "br_santiago")).toBe("recall");
  });
});

describe("quarantineLotAnywhere (modo local)", () => {
  it("rechaza sin motivo", async () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "QANY-01",
      initialQuantity: 5,
      expiresAt: future(120),
    });
    if (!r.ok) throw new Error("setup");
    const res = await quarantineLotAnywhere(r.lot.id, { reason: "" });
    expect(res.ok).toBe(false);
  });

  it("envía lote a cuarentena (modo local)", async () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "QANY-02",
      initialQuantity: 5,
      expiresAt: future(120),
    });
    if (!r.ok) throw new Error("setup");
    const res = await quarantineLotAnywhere(r.lot.id, { reason: "Inspección pendiente" });
    expect(res.ok).toBe(true);
    const lot = listAllLots().find((l) => l.id === r.lot.id);
    expect(lot?.status).toBe("quarantine");
  });
});

describe("releaseLotAnywhere (modo local)", () => {
  it("rechaza sin motivo", async () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "ANYW-01",
      initialQuantity: 5,
      expiresAt: future(120),
    });
    if (!r.ok) throw new Error("setup");
    const res = await releaseLotAnywhere(r.lot.id, { reason: "" });
    expect(res.ok).toBe(false);
  });

  it("libera lote (modo local)", async () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "ANYW-02",
      initialQuantity: 5,
      expiresAt: future(120),
    });
    if (!r.ok) throw new Error("setup");
    const res = await releaseLotAnywhere(r.lot.id, { reason: "Todo OK" });
    expect(res.ok).toBe(true);
  });
});

describe("recallLotAnywhere (modo local)", () => {
  it("rechaza sin motivo", async () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "RECALL-01",
      initialQuantity: 5,
      expiresAt: future(120),
    });
    if (!r.ok) throw new Error("setup");
    const res = await recallLotAnywhere(r.lot.id, { reason: "" });
    expect(res.ok).toBe(false);
  });

  it("marca lote como recalled (modo local)", async () => {
    const r = addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "RECALL-02",
      initialQuantity: 5,
      expiresAt: future(120),
    });
    if (!r.ok) throw new Error("setup");
    const res = await recallLotAnywhere(r.lot.id, { reason: "Defecto de fabricación" });
    expect(res.ok).toBe(true);
    const lot = listAllLots().find((l) => l.id === r.lot.id);
    expect(lot?.status).toBe("recalled");
  });
});

// ─── Movimientos gated (listAllMovements, listMovementsByProduct) ──────────────

describe("listAllMovements (modo local)", () => {
  it("devuelve los movimientos seed + los creados localmente", () => {
    addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "MOV-01",
      initialQuantity: 5,
      expiresAt: future(120),
    });
    const all = listAllMovements();
    // El lote genera al menos 1 movimiento entry_purchase
    expect(all.some((m) => m.type === "entry_purchase" && m.productId === PID)).toBe(true);
  });
});

describe("listMovementsByProduct (modo local)", () => {
  it("filtra solo movimientos del producto y los ordena desc por fecha", () => {
    addLot({
      productId: PID,
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "MOV-02",
      initialQuantity: 3,
      expiresAt: future(100),
    });
    addLot({
      productId: PID,
      branchId: "br_sd_naco",
      warehouseId: "wh_naco_main",
      lotNumber: "MOV-03",
      initialQuantity: 7,
      expiresAt: future(100),
    });
    const moves = listMovementsByProduct(PID);
    // Todos pertenecen al producto
    expect(moves.every((m) => m.productId === PID)).toBe(true);
    // Están en orden descendente
    for (let i = 1; i < moves.length; i++) {
      expect(+new Date(moves[i - 1]!.createdAt)).toBeGreaterThanOrEqual(
        +new Date(moves[i]!.createdAt),
      );
    }
  });

  it("no devuelve movimientos de otro producto", () => {
    addLot({
      productId: "prod_otro",
      branchId: "br_santiago",
      warehouseId: "wh_stg_main",
      lotNumber: "OTHER-01",
      initialQuantity: 2,
      expiresAt: future(90),
    });
    const moves = listMovementsByProduct(PID);
    expect(moves.every((m) => m.productId === PID)).toBe(true);
  });
});

// ─── Helpers puros de stock por sucursal ─────────────────────────────────────

function makeLot(overrides: Partial<{
  id: string;
  branchId: string;
  productId: string;
  currentQuantity: number;
  status: "available" | "quarantine" | "recalled";
  expiresAt: string;
}> = {}): import("@/types").ProductLot {
  return {
    id: overrides.id ?? "lot_x",
    businessId: "biz_1",
    branchId: overrides.branchId ?? "br_santiago",
    productId: overrides.productId ?? PID,
    warehouseId: "wh_1",
    lotNumber: overrides.id ?? "L1",
    expiresAt: overrides.expiresAt ?? future(200),
    receivedAt: new Date().toISOString(),
    initialQuantity: overrides.currentQuantity ?? 10,
    currentQuantity: overrides.currentQuantity ?? 10,
    unitCost: 0,
    status: overrides.status ?? "available",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("sellableStockForBranch", () => {
  it("devuelve 0 si no hay lotes en esa sucursal", () => {
    const lots = [makeLot({ branchId: "br_sd_naco", currentQuantity: 10 })];
    expect(sellableStockForBranch(lots, PID, "br_santiago")).toBe(0);
  });

  it("suma el stock vendible de la sucursal correcta", () => {
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 5 }),
      makeLot({ id: "b", branchId: "br_santiago", currentQuantity: 7 }),
      makeLot({ id: "c", branchId: "br_sd_naco", currentQuantity: 20 }),
    ];
    expect(sellableStockForBranch(lots, PID, "br_santiago")).toBe(12);
  });

  it("excluye lotes vencidos", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 5, expiresAt: past.toISOString() }),
      makeLot({ id: "b", branchId: "br_santiago", currentQuantity: 3 }),
    ];
    expect(sellableStockForBranch(lots, PID, "br_santiago")).toBe(3);
  });

  it("excluye lotes en cuarentena", () => {
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 10, status: "quarantine" }),
      makeLot({ id: "b", branchId: "br_santiago", currentQuantity: 4 }),
    ];
    expect(sellableStockForBranch(lots, PID, "br_santiago")).toBe(4);
  });

  it("excluye lotes en recall", () => {
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 10, status: "recalled" }),
    ];
    expect(sellableStockForBranch(lots, PID, "br_santiago")).toBe(0);
  });

  it("excluye lotes con cantidad 0", () => {
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 0 }),
      makeLot({ id: "b", branchId: "br_santiago", currentQuantity: 6 }),
    ];
    expect(sellableStockForBranch(lots, PID, "br_santiago")).toBe(6);
  });
});

describe("totalSellableStock", () => {
  it("suma solo sucursales activas", () => {
    const activeBranchIds = new Set(["br_santiago"]);
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 8 }),
      makeLot({ id: "b", branchId: "br_sd_naco", currentQuantity: 5 }),
    ];
    expect(totalSellableStock(lots, PID, activeBranchIds)).toBe(8);
  });

  it("suma todas las sucursales activas si hay varias", () => {
    const activeBranchIds = new Set(["br_santiago", "br_sd_naco"]);
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 8 }),
      makeLot({ id: "b", branchId: "br_sd_naco", currentQuantity: 5 }),
    ];
    expect(totalSellableStock(lots, PID, activeBranchIds)).toBe(13);
  });

  it("devuelve 0 si no hay sucursales activas", () => {
    const lots = [makeLot({ branchId: "br_santiago", currentQuantity: 10 })];
    expect(totalSellableStock(lots, PID, new Set())).toBe(0);
  });
});

describe("nextFefoLotForBranch", () => {
  it("devuelve el lote vendible más próximo a vencer", () => {
    const lots = [
      makeLot({ id: "far", branchId: "br_santiago", currentQuantity: 3, expiresAt: future(200) }),
      makeLot({ id: "near", branchId: "br_santiago", currentQuantity: 2, expiresAt: future(45) }),
    ];
    const lot = nextFefoLotForBranch(lots, PID, "br_santiago");
    expect(lot?.id).toBe("near");
  });

  it("devuelve null si no hay lotes vendibles en esa sucursal", () => {
    const past = new Date(); past.setDate(past.getDate() - 1);
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 5, expiresAt: past.toISOString() }),
    ];
    expect(nextFefoLotForBranch(lots, PID, "br_santiago")).toBeNull();
  });

  it("devuelve null si la sucursal no tiene lotes", () => {
    const lots = [makeLot({ branchId: "br_sd_naco", currentQuantity: 5 })];
    expect(nextFefoLotForBranch(lots, PID, "br_santiago")).toBeNull();
  });
});

describe("lotBlockReason", () => {
  it("devuelve null si hay lote vendible", () => {
    const lots = [makeLot({ branchId: "br_santiago", currentQuantity: 5 })];
    expect(lotBlockReason(lots, PID, "br_santiago")).toBeNull();
  });

  it("devuelve 'no-lot' si no hay lotes en la sucursal", () => {
    const lots = [makeLot({ branchId: "br_sd_naco", currentQuantity: 5 })];
    expect(lotBlockReason(lots, PID, "br_santiago")).toBe("no-lot");
  });

  it("devuelve 'expired' si el único lote está vencido", () => {
    const past = new Date(); past.setDate(past.getDate() - 1);
    const lots = [makeLot({ branchId: "br_santiago", currentQuantity: 5, expiresAt: past.toISOString() })];
    expect(lotBlockReason(lots, PID, "br_santiago")).toBe("expired");
  });

  it("devuelve 'quarantine' si el lote está en cuarentena (y no vencido)", () => {
    const lots = [makeLot({ branchId: "br_santiago", currentQuantity: 5, status: "quarantine" })];
    expect(lotBlockReason(lots, PID, "br_santiago")).toBe("quarantine");
  });

  it("devuelve 'recall' si el lote está en recall (y no vencido)", () => {
    const lots = [makeLot({ branchId: "br_santiago", currentQuantity: 5, status: "recalled" })];
    expect(lotBlockReason(lots, PID, "br_santiago")).toBe("recall");
  });

  it("devuelve 'inactive-branch' si la sucursal no está en activeBranchIds", () => {
    const lots = [makeLot({ branchId: "br_santiago", currentQuantity: 5 })];
    expect(lotBlockReason(lots, PID, "br_santiago", new Set())).toBe("inactive-branch");
  });

  it("devuelve 'depleted' si hay lote(s) con qty 0 y status 'available'", () => {
    const lots = [makeLot({ branchId: "br_santiago", currentQuantity: 0, status: "available" })];
    expect(lotBlockReason(lots, PID, "br_santiago")).toBe("depleted");
  });

  it("devuelve 'no-lot' si no hay NINGÚN lote del producto en la sucursal (aunque haya en otra)", () => {
    const lots = [makeLot({ branchId: "br_sd_naco", currentQuantity: 10 })];
    expect(lotBlockReason(lots, PID, "br_santiago")).toBe("no-lot");
  });

  it("devuelve null si branchId es vacío (hydration — no clasificar como inactive-branch)", () => {
    const lots = [makeLot({ branchId: "br_santiago", currentQuantity: 5 })];
    expect(lotBlockReason(lots, PID, "", new Set(["br_santiago"]))).toBeNull();
  });
});

describe("stockByBranchForProduct", () => {
  it("agrupa por sucursal con available correcto", () => {
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 5 }),
      makeLot({ id: "b", branchId: "br_santiago", currentQuantity: 3 }),
      makeLot({ id: "c", branchId: "br_sd_naco", currentQuantity: 7 }),
    ];
    const rows = stockByBranchForProduct(lots, PID);
    const stg = rows.find((r) => r.branchId === "br_santiago")!;
    const naco = rows.find((r) => r.branchId === "br_sd_naco")!;
    expect(stg.available).toBe(8);
    expect(naco.available).toBe(7);
  });

  it("cuenta lotes vencidos separado de los disponibles", () => {
    const past = new Date(); past.setDate(past.getDate() - 1);
    const lots = [
      makeLot({ id: "a", branchId: "br_santiago", currentQuantity: 5 }),
      makeLot({ id: "b", branchId: "br_santiago", currentQuantity: 3, expiresAt: past.toISOString() }),
    ];
    const rows = stockByBranchForProduct(lots, PID);
    const stg = rows.find((r) => r.branchId === "br_santiago")!;
    expect(stg.available).toBe(5);
    expect(stg.expired).toBe(1);
  });
});

// ─── Tests Tarea 5: Flujo completo ISDIN + descuento de stock ─────────────────

describe("Flujo completo: agregar stock → POS ve stock → vender → baja (caso ISDIN)", () => {
  const ISDIN_ID = "prod_isdin_test";
  const BR_NACO = "br_sd_naco";
  const BR_STG = "br_santiago";

  it("T5.1: agregar stock crea lote vendible para la sucursal elegida", async () => {
    const r = await addLotAnywhere({
      productId: ISDIN_ID,
      branchId: BR_NACO,
      warehouseId: "wh_naco_main",
      lotNumber: "ISDIN-001",
      initialQuantity: 10,
      expiresAt: future(365),
      unitCost: 1500,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lots = listAllLots();
    expect(sellableStockForBranch(lots, ISDIN_ID, BR_NACO)).toBe(10);
  });

  it("T5.2: POS ve el stock agregado en esa sucursal", async () => {
    const r = await addLotAnywhere({
      productId: ISDIN_ID,
      branchId: BR_NACO,
      warehouseId: "wh_naco_main",
      lotNumber: "ISDIN-002",
      initialQuantity: 10,
      expiresAt: future(365),
    });
    expect(r.ok).toBe(true);
    const lots = listAllLots();
    expect(sellableStockForBranch(lots, ISDIN_ID, BR_NACO)).toBeGreaterThan(0);
    const lot = nextFefoLotForBranch(lots, ISDIN_ID, BR_NACO);
    expect(lot).not.toBeNull();
  });

  it("T5.3: stock de otra sucursal NO se ve como disponible en la sucursal actual", async () => {
    const r = await addLotAnywhere({
      productId: ISDIN_ID,
      branchId: BR_NACO,
      warehouseId: "wh_naco_main",
      lotNumber: "ISDIN-003",
      initialQuantity: 10,
      expiresAt: future(365),
    });
    expect(r.ok).toBe(true);
    const lots = listAllLots();
    // En Santiago no hay stock de ISDIN (solo en Naco)
    expect(sellableStockForBranch(lots, ISDIN_ID, BR_STG)).toBe(0);
    // El bloqueo es "no-lot" en Santiago
    expect(lotBlockReason(lots, ISDIN_ID, BR_STG)).toBe("no-lot");
  });

  it("T5.4: listado muestra 'aquí' vs 'total' por separado (helpers)", async () => {
    const r1 = await addLotAnywhere({
      productId: ISDIN_ID,
      branchId: BR_NACO,
      warehouseId: "wh_naco_main",
      lotNumber: "ISDIN-004A",
      initialQuantity: 10,
      expiresAt: future(365),
    });
    const r2 = await addLotAnywhere({
      productId: ISDIN_ID,
      branchId: BR_STG,
      warehouseId: "wh_stg_main",
      lotNumber: "ISDIN-004B",
      initialQuantity: 5,
      expiresAt: future(365),
    });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    const lots = listAllLots();
    const activeBranchIds = new Set([BR_NACO, BR_STG]);
    const aquiNaco = sellableStockForBranch(lots, ISDIN_ID, BR_NACO);
    const total = totalSellableStock(lots, ISDIN_ID, activeBranchIds);
    expect(aquiNaco).toBe(10);
    expect(total).toBe(15); // 10 + 5
  });

  it("T5.5: vender DESCUENTA stock (FEFO; currentQuantity baja)", async () => {
    // Agregar 10 unidades en BR_NACO
    const r = await addLotAnywhere({
      productId: ISDIN_ID,
      branchId: BR_NACO,
      warehouseId: "wh_naco_main",
      lotNumber: "ISDIN-005",
      initialQuantity: 10,
      expiresAt: future(365),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lotId = r.lot.id;

    // Simular descuento de 1 unidad (como hace el POS al facturar)
    const lots = listAllLots();
    const lot = lots.find((l) => l.id === lotId);
    expect(lot).toBeDefined();
    const adjResult = await adjustStockAnywhere({
      lotId: lot!.id,
      productId: ISDIN_ID,
      warehouseId: lot!.warehouseId,
      branchId: lot!.branchId,
      newQuantity: lot!.currentQuantity - 1,
      reason: "Venta TEST-001",
    });
    expect(adjResult.ok).toBe(true);

    // Verificar que bajó a 9
    const lotsAfter = listAllLots();
    expect(sellableStockForBranch(lotsAfter, ISDIN_ID, BR_NACO)).toBe(9);
    // Y que hay movimiento de descuento
    const moves = listMovementsByProduct(ISDIN_ID);
    const saleMove = moves.find((m) => m.reason?.includes("Venta TEST-001"));
    expect(saleMove).toBeDefined();
    expect(saleMove?.quantity).toBe(-1);
    expect(saleMove?.type).toBe("adjustment_negative");
  });

  it("T5.6: checkout bloquea con mensaje si no hay stock vendible", () => {
    const lots = listAllLots(); // sin lotes para ISDIN en BR_STG
    // No hay stock de ISDIN en BR_STG, lotBlockReason devuelve no-lot
    const block = lotBlockReason(lots, ISDIN_ID, BR_STG);
    expect(block).toBe("no-lot");
    // sellableStock = 0
    expect(sellableStockForBranch(lots, ISDIN_ID, BR_STG)).toBe(0);
  });

  it("T5.6b: permite venta cuando hay stock vendible (sellableStock > 0)", async () => {
    const r = await addLotAnywhere({
      productId: ISDIN_ID,
      branchId: BR_NACO,
      warehouseId: "wh_naco_main",
      lotNumber: "ISDIN-006",
      initialQuantity: 5,
      expiresAt: future(365),
    });
    expect(r.ok).toBe(true);
    const lots = listAllLots();
    const block = lotBlockReason(lots, ISDIN_ID, BR_NACO);
    expect(block).toBeNull(); // sin bloqueo
    expect(sellableStockForBranch(lots, ISDIN_ID, BR_NACO)).toBeGreaterThan(0);
  });

  it("T5.7: cuarentena/vencido/recall no son vendibles; liberar cuarentena vuelve vendible", () => {
    const past = new Date(); past.setDate(past.getDate() - 1);

    // Lote vencido
    const expiredLot = makeLot({ id: "isd_exp", branchId: BR_NACO, productId: ISDIN_ID, currentQuantity: 5, expiresAt: past.toISOString() });
    expect(sellableStockForBranch([expiredLot], ISDIN_ID, BR_NACO)).toBe(0);

    // Lote en cuarentena
    const quarLot = makeLot({ id: "isd_qtr", branchId: BR_NACO, productId: ISDIN_ID, currentQuantity: 5, status: "quarantine" });
    expect(sellableStockForBranch([quarLot], ISDIN_ID, BR_NACO)).toBe(0);

    // Lote en recall
    const recLot = makeLot({ id: "isd_rcl", branchId: BR_NACO, productId: ISDIN_ID, currentQuantity: 5, status: "recalled" });
    expect(sellableStockForBranch([recLot], ISDIN_ID, BR_NACO)).toBe(0);

    // Liberar cuarentena → vendible
    const r = addLot({
      productId: ISDIN_ID,
      branchId: BR_NACO,
      warehouseId: "wh_naco_main",
      lotNumber: "ISD-QTN",
      initialQuantity: 8,
      expiresAt: future(200),
    });
    if (!r.ok) throw new Error("setup");
    quarantineLotLocal(r.lot.id, "Control");
    expect(sellableStockForBranch(listAllLots(), ISDIN_ID, BR_NACO)).toBe(0);
    releaseLotLocal(r.lot.id, "Revisión OK");
    expect(sellableStockForBranch(listAllLots(), ISDIN_ID, BR_NACO)).toBe(8);
  });

  it("T5.8: FEFO elige el lote más próximo a vencer", () => {
    const near = makeLot({ id: "isd_near", branchId: BR_NACO, productId: ISDIN_ID, currentQuantity: 3, expiresAt: future(30) });
    const far = makeLot({ id: "isd_far", branchId: BR_NACO, productId: ISDIN_ID, currentQuantity: 6, expiresAt: future(365) });
    const lot = nextFefoLotForBranch([far, near], ISDIN_ID, BR_NACO);
    expect(lot?.id).toBe("isd_near");
  });

  it("T5.9: sin texto warehouse/almacén ni 'Naco' como literal operativo en helpers puros", () => {
    // Los nombres de sucursales son resueltos en la UI, los helpers puros solo usan IDs
    // Verificar que lotBlockReason / sellableStockForBranch no producen strings con warehouse
    const lots = [makeLot({ branchId: "br_sd_naco", productId: ISDIN_ID, currentQuantity: 5 })];
    const reason = lotBlockReason(lots, ISDIN_ID, BR_STG);
    // reason es un código interno, no un label con "almacén"
    expect(typeof reason === "string" || reason === null).toBe(true);
    if (reason) {
      expect(reason).not.toMatch(/almac[eé]n/i);
      expect(reason).not.toMatch(/warehouse/i);
    }
  });
});
