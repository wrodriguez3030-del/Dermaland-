import { describe, it, expect } from "vitest";
import { buildImportPlan, type PlanLot, type PlanProduct } from "./alegra-import";

const P = (id: string, name: string): PlanProduct => ({ id, name });
const L = (
  id: string,
  productId: string,
  quantity: number,
  expiresAt = "2027-01-31",
  receivedAt = "2026-01-01",
): PlanLot => ({ id, productId, warehouseId: "wh-prin", quantity, expiresAt, receivedAt, lotNumber: `LOT-${id}` });

const base = {
  products: [P("p1", "Crema 30 ML")],
  cutisWarehouseId: "wh-cutis",
  zeroMissing: false,
};

describe("buildImportPlan · Principal", () => {
  it("baja el stock consumiendo primero el lote que vence antes (FEFO)", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 5, qtyTotal: 5 }],
      principalLots: [L("a", "p1", 4, "2028-01-01"), L("b", "p1", 6, "2026-06-01")],
      cutisLots: [],
    });
    // total 10 → objetivo 5 ⇒ quitar 5: primero del lote "b" (vence antes)
    expect(plan.principal[0]!.delta).toBe(-5);
    expect(plan.principal[0]!.lotChanges).toEqual([
      { lotId: "b", lotNumber: "LOT-b", warehouseId: "wh-prin", from: 6, to: 1 },
    ]);
  });

  it("reparte la baja entre varios lotes cuando uno no alcanza", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 1, qtyTotal: 1 }],
      principalLots: [L("a", "p1", 4, "2028-01-01"), L("b", "p1", 6, "2026-06-01")],
      cutisLots: [],
    });
    expect(plan.principal[0]!.lotChanges).toEqual([
      { lotId: "b", lotNumber: "LOT-b", warehouseId: "wh-prin", from: 6, to: 0 },
      { lotId: "a", lotNumber: "LOT-a", warehouseId: "wh-prin", from: 4, to: 1 },
    ]);
  });

  it("sube el stock en el lote recibido más recientemente", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 7, qtyTotal: 7 }],
      principalLots: [L("a", "p1", 2, "2028-01-01", "2026-01-01"), L("b", "p1", 3, "2026-06-01", "2026-05-01")],
      cutisLots: [],
    });
    expect(plan.principal[0]!.delta).toBe(2);
    expect(plan.principal[0]!.lotChanges).toEqual([
      { lotId: "b", lotNumber: "LOT-b", warehouseId: "wh-prin", from: 3, to: 5 },
    ]);
  });

  it("no genera ajuste cuando ya coincide (idempotencia)", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 4, qtyTotal: 4 }],
      principalLots: [L("a", "p1", 4)],
      cutisLots: [],
    });
    expect(plan.principal).toEqual([]);
  });
});

describe("buildImportPlan · Cutis", () => {
  it("crea un lote nuevo heredando el vencimiento del lote de Principal", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 3, qtyTotal: 8 }],
      principalLots: [L("a", "p1", 3, "2029-03-15")],
      cutisLots: [],
    });
    expect(plan.cutis[0]).toMatchObject({
      productId: "p1",
      current: 0,
      target: 5,
      delta: 5,
      newLot: { expiresAt: "2029-03-15", quantity: 5, warehouseId: "wh-cutis" },
    });
  });

  it("si el producto no tiene lote en Principal, no inventa fecha: lo omite", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 0, qtyTotal: 5 }],
      principalLots: [],
      cutisLots: [],
    });
    expect(plan.cutis).toEqual([]);
    expect(plan.skipped.map((s) => s.error).join()).toMatch(/vencimiento/i);
  });

  it("ajusta el lote existente de Cutis en vez de crear uno nuevo", () => {
    const cutis: PlanLot = { ...L("c", "p1", 9), warehouseId: "wh-cutis" };
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 1, qtyTotal: 4 }],
      principalLots: [L("a", "p1", 1)],
      cutisLots: [cutis],
    });
    expect(plan.cutis[0]!.delta).toBe(-6);
    expect(plan.cutis[0]!.newLot).toBeUndefined();
  });
});

describe("buildImportPlan · casos que no se aplican", () => {
  it("reporta las filas que no emparejan con ningún producto", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 5, name: "PRODUCTO QUE NO EXISTE", qtyPrincipal: 2, qtyTotal: 2 }],
      principalLots: [],
      cutisLots: [],
    });
    expect(plan.unmatched).toEqual([
      { rowNumber: 5, name: "PRODUCTO QUE NO EXISTE", principal: 2, cutis: 0 },
    ]);
  });

  it("suma las filas que apuntan al mismo producto y lo reporta", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [
        { rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 2, qtyTotal: 2 },
        { rowNumber: 3, name: "Crema 30 ML", qtyPrincipal: 3, qtyTotal: 3 },
      ],
      principalLots: [L("a", "p1", 0)],
      cutisLots: [],
    });
    expect(plan.principal[0]!.target).toBe(5);
    expect(plan.collisions).toEqual([{ productName: "Crema 30 ML", rows: [2, 3] }]);
  });

  it("con zeroMissing pone en 0 los productos ausentes del archivo", () => {
    const plan = buildImportPlan({
      ...base,
      products: [P("p1", "Crema 30 ML"), P("p2", "Otro")],
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 1, qtyTotal: 1 }],
      principalLots: [L("a", "p1", 1), L("z", "p2", 12)],
      cutisLots: [],
      zeroMissing: true,
    });
    expect(plan.principal.find((a) => a.productId === "p2")).toMatchObject({ target: 0, delta: -12 });
  });

  it("sin zeroMissing deja intactos los productos ausentes", () => {
    const plan = buildImportPlan({
      ...base,
      products: [P("p1", "Crema 30 ML"), P("p2", "Otro")],
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 1, qtyTotal: 1 }],
      principalLots: [L("a", "p1", 1), L("z", "p2", 12)],
      cutisLots: [],
      zeroMissing: false,
    });
    expect(plan.principal.find((a) => a.productId === "p2")).toBeUndefined();
  });

  it("los totales reflejan el antes y el después de cada sucursal", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 2, qtyTotal: 6 }],
      principalLots: [L("a", "p1", 10, "2029-01-01")],
      cutisLots: [],
    });
    expect(plan.totals).toEqual({
      principalBefore: 10,
      principalAfter: 2,
      cutisBefore: 0,
      cutisAfter: 4,
    });
  });
});
