import { describe, it, expect } from "vitest";
import { mockRepositories } from "./index";
import type { RepoContext } from "../types";

const ctx: RepoContext = { businessId: "biz_dermaland" };
const otherCtx: RepoContext = { businessId: "biz_otra_empresa" };

describe("mockRepositories.search.global — integración", () => {
  it("consulta corta (<2) devuelve vacío sin tocar datos", async () => {
    const r = await mockRepositories.search.global(ctx, "a");
    expect(r.total).toBe(0);
    expect(r.groups).toEqual([]);
  });

  it("busca productos por marca real del catálogo (EUCERIN) y devuelve rutas /productos/", async () => {
    const r = await mockRepositories.search.global(ctx, "EUCERIN");
    const products = r.groups.find((g) => g.kind === "product");
    expect(products && products.items.length > 0).toBe(true);
    for (const it of products!.items) {
      expect(it.href.startsWith("/productos/")).toBe(true);
      // No exponer UUIDs/ids técnicos en el texto visible.
      expect(it.title).not.toMatch(/^prod_/);
    }
  });

  it("20. aislamiento por negocio: otro business_id no ve datos de DermaLand", async () => {
    const r = await mockRepositories.search.global(otherCtx, "EUCERIN");
    expect(r.total).toBe(0);
  });

  it("respeta el límite por categoría (perGroup)", async () => {
    const r = await mockRepositories.search.global(ctx, "a".repeat(1) + "e", { perGroup: 2 });
    for (const g of r.groups) expect(g.items.length).toBeLessThanOrEqual(2);
  });
});
