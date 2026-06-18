import { describe, it, expect, afterEach } from "vitest";
import {
  mockRepositories,
  __resetCatalogMockWrites,
} from "@/server/repositories/mock";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import type { RepoContext } from "@/server/repositories";

const ctx: RepoContext = { businessId: mockBusiness.id, userId: "usr_test" };

afterEach(() => {
  __resetCatalogMockWrites();
});

describe("ProductRepository (mock) — escritura", () => {
  it("create() agrega un producto del negocio y lo lista", async () => {
    const created = await mockRepositories.product.create(ctx, {
      businessId: mockBusiness.id,
      sku: "TEST-SKU-1",
      name: "Producto de prueba",
      unit: "unidad",
      requiresPrescription: false,
      controlled: false,
      cost: 0,
      price: 100,
      itbisRate: 18,
      minStock: 0,
      maxStock: 0,
      active: true,
      sellable: true,
    });
    expect(created.id).toBeTruthy();
    const all = await mockRepositories.product.list(ctx);
    expect(all.some((p) => p.sku === "TEST-SKU-1")).toBe(true);
  });

  it("update() aplica patch", async () => {
    const created = await mockRepositories.product.create(ctx, {
      businessId: mockBusiness.id,
      sku: "TEST-SKU-2",
      name: "Antes",
      unit: "unidad",
      requiresPrescription: false,
      controlled: false,
      cost: 0,
      price: 50,
      itbisRate: 18,
      minStock: 0,
      maxStock: 0,
      active: true,
      sellable: true,
    });
    const updated = await mockRepositories.product.update(ctx, created.id, {
      name: "Después",
    });
    expect(updated.name).toBe("Después");
  });

  it("softDelete() lo saca del list", async () => {
    const created = await mockRepositories.product.create(ctx, {
      businessId: mockBusiness.id,
      sku: "TEST-SKU-3",
      name: "Borrar",
      unit: "unidad",
      requiresPrescription: false,
      controlled: false,
      cost: 0,
      price: 10,
      itbisRate: 18,
      minStock: 0,
      maxStock: 0,
      active: true,
      sellable: true,
    });
    await mockRepositories.product.softDelete(ctx, created.id);
    const all = await mockRepositories.product.list(ctx);
    expect(all.some((p) => p.id === created.id)).toBe(false);
  });
});
