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
    expect(res).toMatchObject({ appliedCutis: 1, lotsCreated: 1, movements: 1 });
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
    expect(res.appliedPrincipal).toBe(1);
  });
});
