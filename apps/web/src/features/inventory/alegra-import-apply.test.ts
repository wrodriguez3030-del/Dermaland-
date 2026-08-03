import { describe, it, expect, vi } from "vitest";
import type { RepoContext, Repositories } from "@/server/repositories";
import { applyImportPlan, importReference } from "./alegra-import-apply";
import type { ImportPlan } from "./alegra-import";
import type { ImportSources } from "./alegra-import-sources";

const ctx: RepoContext = { businessId: "biz-1", userId: "u1", userName: "Ana" };

const sources: ImportSources = {
  products: [],
  principalLots: [],
  cutisLots: [],
  cutisWarehouseId: "wh-cutis",
  principalId: "b-prin",
  cutisId: "b-cutis",
  principalName: "DermaLand Principal",
  cutisName: "Dermaland Cutis",
};

const emptyPlan: ImportPlan = {
  principal: [],
  cutis: [],
  skipped: [],
  unmatched: [],
  collisions: [],
  totals: { principalBefore: 0, principalAfter: 0, cutisBefore: 0, cutisAfter: 0 },
};

// ─── Fake de Repositories ───────────────────────────────────────────────
//
// Solo se implementan los dos sub-repos que `applyImportPlan` realmente usa
// (productLot, inventoryMovement); el resto no hace falta para estos tests,
// igual que el fake de `alegra-import-sources.test.ts`.
function makeRepos(): Repositories {
  return {
    productLot: {
      adjustQuantity: vi.fn().mockResolvedValue({ id: "l1" }),
      create: vi.fn().mockResolvedValue({ id: "new-lot" }),
    },
    inventoryMovement: { create: vi.fn().mockResolvedValue({ id: "m1" }) },
  } as unknown as Repositories;
}

describe("importReference", () => {
  it("usa un formato estable y legible", () => {
    expect(importReference(new Date("2026-08-02T15:04:00Z"))).toMatch(/^ALEGRA-20260802-\d{4}$/);
  });
});

describe("applyImportPlan", () => {
  it("ajusta el lote y registra UN movimiento por producto", async () => {
    const repos = makeRepos();
    const plan: ImportPlan = {
      ...emptyPlan,
      principal: [
        {
          productId: "p1",
          productName: "Crema",
          current: 10,
          target: 4,
          delta: -6,
          lotChanges: [{ lotId: "l1", lotNumber: "L1", warehouseId: "wh-prin", from: 10, to: 4 }],
        },
      ],
    };
    const res = await applyImportPlan(ctx, repos, plan, sources, "ALEGRA-X");
    expect(repos.productLot.adjustQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: "b-prin" }),
      "l1",
      4,
    );
    expect(repos.inventoryMovement.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "adjustment_negative",
        quantity: 6,
        warehouseId: "wh-prin",
        reference: "ALEGRA-X",
      }),
    );
    expect(res).toMatchObject({ appliedPrincipal: 1, lotsUpdated: 1, movements: 1, failures: [] });
    expect(typeof res.durationMs).toBe("number");
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("crea el lote en Cutis con el vencimiento heredado", async () => {
    const repos = makeRepos();
    const plan: ImportPlan = {
      ...emptyPlan,
      cutis: [
        {
          productId: "p1",
          productName: "Crema",
          current: 0,
          target: 5,
          delta: 5,
          lotChanges: [],
          newLot: { expiresAt: "2029-03-15", quantity: 5, warehouseId: "wh-cutis" },
        },
      ],
    };
    const res = await applyImportPlan(ctx, repos, plan, sources, "ALEGRA-X");
    expect(repos.productLot.create).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: "b-cutis" }),
      expect.objectContaining({ productId: "p1", expiresAt: "2029-03-15", currentQuantity: 5 }),
    );
    // Gotcha del 2026-08-01: `inventory_movements.warehouse_id` es NOT NULL,
    // y `lot_id` es NULLABLE — un `lotId` indefinido insertaría NULL en
    // silencio. El movimiento del lote NUEVO debe llevar el almacén de Cutis
    // y el id del lote recién creado (el que devuelve `productLot.create`,
    // "new-lot" en el fake), no un valor separado que pudiera desincronizarse.
    expect(repos.inventoryMovement.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lotId: "new-lot",
        warehouseId: "wh-cutis",
        branchId: "b-cutis",
      }),
    );
    expect(res).toMatchObject({ appliedCutis: 1, lotsCreated: 1, movements: 1, failures: [] });
  });

  it("usa adjustment_positive cuando el stock sube", async () => {
    const repos = makeRepos();
    const plan: ImportPlan = {
      ...emptyPlan,
      principal: [
        {
          productId: "p1",
          productName: "Crema",
          current: 1,
          target: 3,
          delta: 2,
          lotChanges: [{ lotId: "l1", lotNumber: "L1", warehouseId: "wh-prin", from: 1, to: 3 }],
        },
      ],
    };
    await applyImportPlan(ctx, repos, plan, sources, "ALEGRA-X");
    expect(repos.inventoryMovement.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "adjustment_positive", quantity: 2 }),
    );
  });

  it("un fallo no aborta el resto: lo reporta y sigue", async () => {
    const repos = makeRepos();
    repos.productLot.adjustQuantity = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ id: "l2" });
    const adj = (id: string) => ({
      productId: id,
      productName: id,
      current: 5,
      target: 1,
      delta: -4,
      lotChanges: [{ lotId: `l-${id}`, lotNumber: "L", warehouseId: "wh-prin", from: 5, to: 1 }],
    });
    const plan: ImportPlan = { ...emptyPlan, principal: [adj("p1"), adj("p2")] };
    const res = await applyImportPlan(ctx, repos, plan, sources, "ALEGRA-X");
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]).toMatchObject({ stockAplicado: false });
    expect(res.appliedPrincipal).toBe(1);
  });

  it("el lote se ajustó pero el movimiento falló: revierte el stock y lo marca en el failure", async () => {
    const repos = makeRepos();
    repos.inventoryMovement.create = vi.fn().mockRejectedValue(new Error("boom-movement"));
    const plan: ImportPlan = {
      ...emptyPlan,
      principal: [
        {
          productId: "p1",
          productName: "Crema",
          current: 10,
          target: 4,
          delta: -6,
          lotChanges: [{ lotId: "l1", lotNumber: "L1", warehouseId: "wh-prin", from: 10, to: 4 }],
        },
      ],
    };
    const res = await applyImportPlan(ctx, repos, plan, sources, "ALEGRA-X");

    // Ajustó hacia el objetivo (10→4) y, al fallar el movimiento, COMPENSÓ
    // revirtiendo el mismo lote a su valor `from` (4→10) — el stock no puede
    // quedar cambiado sin su movimiento correspondiente.
    expect(repos.productLot.adjustQuantity).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ branchId: "b-prin" }),
      "l1",
      4,
    );
    expect(repos.productLot.adjustQuantity).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ branchId: "b-prin" }),
      "l1",
      10,
    );
    // Nada quedó EN FIRME: el producto no completó (movimiento incluido).
    expect(res.lotsUpdated).toBe(0);
    expect(res.appliedPrincipal).toBe(0);
    expect(res.movements).toBe(0);
    expect(res.failures).toEqual([
      expect.objectContaining({ productName: "Crema", stockAplicado: false }),
    ]);
    expect(res.failures[0]?.error).toMatch(/revirtió/i);
  });

  it("si además falla la reversión, marca stockAplicado en true y lo dice explícitamente", async () => {
    const repos = makeRepos();
    repos.inventoryMovement.create = vi.fn().mockRejectedValue(new Error("boom-movement"));
    repos.productLot.adjustQuantity = vi
      .fn()
      .mockResolvedValueOnce({ id: "l1" }) // ajuste hacia el objetivo: OK
      .mockRejectedValueOnce(new Error("boom-revert")); // intento de reversión: falla
    const plan: ImportPlan = {
      ...emptyPlan,
      principal: [
        {
          productId: "p1",
          productName: "Crema",
          current: 10,
          target: 4,
          delta: -6,
          lotChanges: [{ lotId: "l1", lotNumber: "L1", warehouseId: "wh-prin", from: 10, to: 4 }],
        },
      ],
    };
    const res = await applyImportPlan(ctx, repos, plan, sources, "ALEGRA-X");

    // El operador NO puede leer "falló" y asumir que no se tocó nada: el
    // stock quedó en 4 (aplicado) y ni el movimiento ni la reversión se
    // pudieron registrar.
    expect(res.failures).toEqual([
      expect.objectContaining({ productName: "Crema", stockAplicado: true }),
    ]);
    expect(res.failures[0]?.error).toMatch(/no se pudo revertir/i);
    expect(res.appliedPrincipal).toBe(0);
    expect(res.lotsUpdated).toBe(0);
  });

  it("el lote nuevo se creó pero el movimiento falló: lo revierte a 0 y lo marca en el failure", async () => {
    const repos = makeRepos();
    repos.inventoryMovement.create = vi.fn().mockRejectedValue(new Error("boom-movement"));
    const plan: ImportPlan = {
      ...emptyPlan,
      cutis: [
        {
          productId: "p1",
          productName: "Crema",
          current: 0,
          target: 5,
          delta: 5,
          lotChanges: [],
          newLot: { expiresAt: "2029-03-15", quantity: 5, warehouseId: "wh-cutis" },
        },
      ],
    };
    const res = await applyImportPlan(ctx, repos, plan, sources, "ALEGRA-X");

    // No existía antes: compensar un lote CREADO significa dejarlo en 0, no
    // "restaurar" un valor previo que nunca existió.
    expect(repos.productLot.adjustQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: "b-cutis" }),
      "new-lot",
      0,
    );
    expect(res.lotsCreated).toBe(0);
    expect(res.appliedCutis).toBe(0);
    expect(res.failures).toEqual([
      expect.objectContaining({ productName: "Crema", stockAplicado: false }),
    ]);
  });
});
