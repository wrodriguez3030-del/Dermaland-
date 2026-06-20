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

describe("Catálogos (mock) — escritura", () => {
  it("brand create/update/delete", async () => {
    const b = await mockRepositories.brand.create(ctx, { name: "MARCA X" });
    expect(b.id).toBeTruthy();
    const u = await mockRepositories.brand.update(ctx, b.id, { name: "MARCA Y" });
    expect(u.name).toBe("MARCA Y");
    await mockRepositories.brand.delete(ctx, b.id);
    const all = await mockRepositories.brand.list(ctx);
    expect(all.some((x) => x.id === b.id)).toBe(false);
  });

  it("category create con parentId y description", async () => {
    const c = await mockRepositories.category.create(ctx, {
      name: "CAT X",
      description: "desc",
    });
    expect(c.name).toBe("CAT X");
    expect(c.description).toBe("desc");
  });

  it("laboratory create con country", async () => {
    const l = await mockRepositories.laboratory.create(ctx, {
      name: "LAB X",
      country: "España",
    });
    expect(l.country).toBe("España");
  });
});
