import { describe, it, expect, beforeEach } from "vitest";
import { mockRepositories, __resetInventoryCountMockWrites } from "./index";
import type { RepoContext } from "../types";

const ctx: RepoContext = { businessId: "biz_dermaland", userId: "u1" };
const repo = mockRepositories.inventoryCount;

const newInput = {
  countNumber: "CONT-TEST",
  branchId: "br_santiago",
  countType: "full" as const,
  items: [
    {
      productId: "p1",
      productSku: "SKU-1",
      productName: "Crema A",
      lotNumber: "L-1",
      expiresAt: "2026-12-31",
      expectedQuantity: 10,
      countedQuantity: 8,
      status: "shortage" as const,
    },
    {
      productId: "p2",
      productSku: "SKU-2",
      productName: "Crema B",
      expectedQuantity: 5,
      countedQuantity: 5,
      status: "match" as const,
    },
  ],
};

describe("inventoryCount mock — escrituras (Fase 3)", () => {
  beforeEach(() => __resetInventoryCountMockWrites());

  it("create devuelve la cabecera y la hace visible en list/byId/items", async () => {
    const created = await repo.create(ctx, newInput);
    expect(created.id).toBeTruthy();
    expect(created.businessId).toBe("biz_dermaland");
    expect(created.status).toBe("in_progress");
    expect(created.itemCount).toBe(2);

    const list = await repo.list(ctx);
    expect(list.some((c) => c.id === created.id)).toBe(true);

    const byId = await repo.byId(ctx, created.id);
    expect(byId?.id).toBe(created.id);

    const items = await repo.items(ctx, created.id);
    expect(items).toHaveLength(2);
    // difference derivada (contado − esperado) cuando no viene
    expect(items.find((i) => i.productSku === "SKU-1")?.differenceQuantity).toBe(-2);
    expect(items.find((i) => i.productSku === "SKU-2")?.differenceQuantity).toBe(0);
  });

  it("otro tenant no ve el conteo creado", async () => {
    const created = await repo.create(ctx, newInput);
    const otro = await repo.byId({ businessId: "biz_otro" }, created.id);
    expect(otro).toBeNull();
  });

  it("submit → approve → reject transicionan el estado", async () => {
    const c = await repo.create(ctx, newInput);
    await repo.submit(ctx, c.id);
    expect((await repo.byId(ctx, c.id))?.status).toBe("submitted");
    await repo.approve(ctx, c.id);
    expect((await repo.byId(ctx, c.id))?.status).toBe("approved");
    await repo.reject(ctx, c.id, "Diferencias no justificadas");
    const rejected = await repo.byId(ctx, c.id);
    expect(rejected?.status).toBe("rejected");
    expect(rejected?.notes).toBe("Diferencias no justificadas");
  });

  it("recordScan en mock siempre acepta (idempotencia real es de Supabase)", async () => {
    const r = await repo.recordScan(ctx, {
      inventoryCountId: "c1",
      productId: "p1",
      branchId: "br_santiago",
      warehouseId: "wh1",
      scannedQuantity: 1,
      scanSource: "camera",
      scannedBy: "",
      scannedByName: "",
      scannedAt: "2026-07-01T10:00:00Z",
      deviceId: "dev1",
      offlineScanId: "off1",
      syncStatus: "synced",
    });
    expect(r.inserted).toBe(true);
  });
});
