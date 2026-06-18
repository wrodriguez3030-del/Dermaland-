import { describe, it, expect, afterEach } from "vitest";
import {
  mockRepositories,
  __resetLotMockWrites,
} from "@/server/repositories/mock";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { mockProductLots } from "@/lib/mock-data/catalog";
import type { RepoContext } from "@/server/repositories";

const ctx: RepoContext = { businessId: mockBusiness.id, userId: "usr_test" };

// IDs estables del seed
const SEED_PRODUCT_ID = mockProductLots[0]?.productId ?? "prod_test";
const SEED_BRANCH_ID = mockProductLots[0]?.branchId ?? "br_test";
const SEED_WAREHOUSE_ID = mockProductLots[0]?.warehouseId ?? "wh_test";

afterEach(() => {
  __resetLotMockWrites();
});

describe("ProductLotRepository (mock) — create", () => {
  it("create() agrega el lote y aparece en list()", async () => {
    const now = new Date().toISOString();
    const created = await mockRepositories.productLot.create(ctx, {
      businessId: ctx.businessId,
      branchId: SEED_BRANCH_ID,
      productId: SEED_PRODUCT_ID,
      warehouseId: SEED_WAREHOUSE_ID,
      lotNumber: "LOT-TEST-001",
      expiresAt: "2027-12-31",
      receivedAt: now,
      initialQuantity: 100,
      currentQuantity: 100,
      unitCost: 50,
      status: "available",
    });

    expect(created.id).toBeTruthy();
    expect(created.lotNumber).toBe("LOT-TEST-001");
    expect(created.currentQuantity).toBe(100);
    expect(created.status).toBe("available");
    expect(created.businessId).toBe(ctx.businessId);

    const all = await mockRepositories.productLot.list(ctx);
    expect(all.some((l) => l.id === created.id)).toBe(true);
  });

  it("create() con businessId distinto → NO aparece en list del tenant original", async () => {
    const now = new Date().toISOString();
    const otherCtx: RepoContext = { businessId: "biz_otro", userId: "usr_test" };
    const created = await mockRepositories.productLot.create(otherCtx, {
      businessId: otherCtx.businessId,
      branchId: SEED_BRANCH_ID,
      productId: SEED_PRODUCT_ID,
      warehouseId: SEED_WAREHOUSE_ID,
      lotNumber: "LOT-OTRO-001",
      expiresAt: "2027-12-31",
      receivedAt: now,
      initialQuantity: 10,
      currentQuantity: 10,
      unitCost: 10,
      status: "available",
    });

    const all = await mockRepositories.productLot.list(ctx);
    expect(all.some((l) => l.id === created.id)).toBe(false);
  });

  it("byId() retorna el lote creado", async () => {
    const now = new Date().toISOString();
    const created = await mockRepositories.productLot.create(ctx, {
      businessId: ctx.businessId,
      branchId: SEED_BRANCH_ID,
      productId: SEED_PRODUCT_ID,
      warehouseId: SEED_WAREHOUSE_ID,
      lotNumber: "LOT-BYID-001",
      expiresAt: "2027-06-30",
      receivedAt: now,
      initialQuantity: 20,
      currentQuantity: 20,
      unitCost: 30,
      status: "available",
    });

    const found = await mockRepositories.productLot.byId(ctx, created.id);
    expect(found).not.toBeNull();
    expect(found?.lotNumber).toBe("LOT-BYID-001");
  });

  it("list() filtra por productId", async () => {
    const now = new Date().toISOString();
    await mockRepositories.productLot.create(ctx, {
      businessId: ctx.businessId,
      branchId: SEED_BRANCH_ID,
      productId: "prod_filtrar",
      warehouseId: SEED_WAREHOUSE_ID,
      lotNumber: "LOT-FILTER-001",
      expiresAt: "2027-01-01",
      receivedAt: now,
      initialQuantity: 5,
      currentQuantity: 5,
      unitCost: 0,
      status: "available",
    });

    const filtered = await mockRepositories.productLot.list(ctx, { productId: "prod_filtrar" });
    expect(filtered.every((l) => l.productId === "prod_filtrar")).toBe(true);
    expect(filtered.some((l) => l.lotNumber === "LOT-FILTER-001")).toBe(true);
  });
});

describe("ProductLotRepository (mock) — adjustQuantity", () => {
  it("adjustQuantity() cambia currentQuantity y lo refleja en byId()", async () => {
    const now = new Date().toISOString();
    const created = await mockRepositories.productLot.create(ctx, {
      businessId: ctx.businessId,
      branchId: SEED_BRANCH_ID,
      productId: SEED_PRODUCT_ID,
      warehouseId: SEED_WAREHOUSE_ID,
      lotNumber: "LOT-ADJ-001",
      expiresAt: "2028-01-01",
      receivedAt: now,
      initialQuantity: 50,
      currentQuantity: 50,
      unitCost: 25,
      status: "available",
    });

    const adjusted = await mockRepositories.productLot.adjustQuantity(ctx, created.id, 30);
    expect(adjusted.currentQuantity).toBe(30);
    expect(adjusted.id).toBe(created.id);

    const found = await mockRepositories.productLot.byId(ctx, created.id);
    expect(found?.currentQuantity).toBe(30);
  });

  it("adjustQuantity() en lote del seed seed no está disponible directamente pero via create sí", async () => {
    const now = new Date().toISOString();
    // Crear un lote, ajustar a 0, verificar
    const created = await mockRepositories.productLot.create(ctx, {
      businessId: ctx.businessId,
      branchId: SEED_BRANCH_ID,
      productId: SEED_PRODUCT_ID,
      warehouseId: SEED_WAREHOUSE_ID,
      lotNumber: "LOT-ADJ-ZERO",
      expiresAt: "2028-06-01",
      receivedAt: now,
      initialQuantity: 10,
      currentQuantity: 10,
      unitCost: 0,
      status: "available",
    });

    const adjusted = await mockRepositories.productLot.adjustQuantity(ctx, created.id, 0);
    expect(adjusted.currentQuantity).toBe(0);
  });

  it("adjustQuantity() en lote inexistente lanza error", async () => {
    await expect(
      mockRepositories.productLot.adjustQuantity(ctx, "lot_no_existe", 5),
    ).rejects.toThrow();
  });

  it("list() refleja el overlay después de adjustQuantity()", async () => {
    const now = new Date().toISOString();
    const created = await mockRepositories.productLot.create(ctx, {
      businessId: ctx.businessId,
      branchId: SEED_BRANCH_ID,
      productId: SEED_PRODUCT_ID,
      warehouseId: SEED_WAREHOUSE_ID,
      lotNumber: "LOT-LIST-ADJ",
      expiresAt: "2028-03-15",
      receivedAt: now,
      initialQuantity: 100,
      currentQuantity: 100,
      unitCost: 10,
      status: "available",
    });

    await mockRepositories.productLot.adjustQuantity(ctx, created.id, 42);

    const all = await mockRepositories.productLot.list(ctx);
    const found = all.find((l) => l.id === created.id);
    expect(found?.currentQuantity).toBe(42);
  });
});

describe("__resetLotMockWrites", () => {
  it("después del reset los lotes creados desaparecen", async () => {
    const now = new Date().toISOString();
    const created = await mockRepositories.productLot.create(ctx, {
      businessId: ctx.businessId,
      branchId: SEED_BRANCH_ID,
      productId: SEED_PRODUCT_ID,
      warehouseId: SEED_WAREHOUSE_ID,
      lotNumber: "LOT-RESET-001",
      expiresAt: "2027-12-31",
      receivedAt: now,
      initialQuantity: 1,
      currentQuantity: 1,
      unitCost: 0,
      status: "available",
    });

    __resetLotMockWrites();

    const all = await mockRepositories.productLot.list(ctx);
    expect(all.some((l) => l.id === created.id)).toBe(false);
  });
});
