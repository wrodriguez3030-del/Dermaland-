import { describe, it, expect, vi } from "vitest";
import type { RepoContext, Repositories } from "@/server/repositories";
import { loadImportSources, pickImportBranches } from "./alegra-import-sources";

describe("pickImportBranches", () => {
  it("encuentra Principal y Cutis sin importar mayúsculas ni acentos", () => {
    const r = pickImportBranches([
      { id: "b1", name: "DermaLand Principal" },
      { id: "b2", name: "Dermaland Cutis" },
    ]);
    expect(r.principal.id).toBe("b1");
    expect(r.cutis.id).toBe("b2");
  });

  it("explica cuál falta en vez de fallar en silencio", () => {
    expect(() => pickImportBranches([{ id: "b1", name: "DermaLand Principal" }]))
      .toThrow(/Cutis/);
  });

  it("si hay dos que empatan, pide desambiguar", () => {
    expect(() =>
      pickImportBranches([
        { id: "b1", name: "DermaLand Principal" },
        { id: "b9", name: "Dermaland principal" },
        { id: "b2", name: "Dermaland Cutis" },
      ]),
    ).toThrow(/más de una/i);
  });
});

// ─── Fakes de Repositories ────────────────────────────────────────────────
//
// Solo se implementan los métodos que `loadImportSources` realmente usa
// (branch, product, warehouse, productLot); el resto no hace falta para
// estos tests y se castea al final.

const ctx = { businessId: "biz-1" } as RepoContext;

function makeRepos(overrides: {
  branches?: Array<{ id: string; name: string }>;
  products?: Array<{ id: string; name: string; active?: boolean }>;
  warehouses?: Array<{ id: string; branchId: string; isMain: boolean }>;
  lots?: Array<{
    id: string;
    productId: string;
    warehouseId: string;
    branchId: string;
    currentQuantity: number;
    expiresAt: string;
    receivedAt: string;
    lotNumber: string;
  }>;
  productListImpl?: ReturnType<typeof vi.fn>;
}): Repositories {
  const branches = overrides.branches ?? [
    { id: "principal-id", name: "DermaLand Principal" },
    { id: "cutis-id", name: "Dermaland Cutis" },
  ];
  const products = overrides.products ?? [];
  const warehouses = overrides.warehouses ?? [
    { id: "wh-cutis", branchId: "cutis-id", isMain: true },
  ];
  const lots = overrides.lots ?? [];

  const productList =
    overrides.productListImpl ??
    vi.fn(async (_c: RepoContext, opts?: { limit?: number; offset?: number }) => {
      const offset = opts?.offset ?? 0;
      const limit = opts?.limit ?? products.length;
      return products.slice(offset, offset + limit);
    });

  return {
    branch: { list: vi.fn(async () => branches) },
    product: { list: productList },
    warehouse: {
      list: vi.fn(async (_c: RepoContext, branchId?: string) =>
        warehouses.filter((w) => !branchId || w.branchId === branchId),
      ),
    },
    productLot: { list: vi.fn(async () => lots) },
  } as unknown as Repositories;
}

describe("loadImportSources", () => {
  it("separa productos y lotes por sucursal, y resuelve el almacén de Cutis", async () => {
    const repos = makeRepos({
      products: [
        { id: "p1", name: "Crema X" },
        { id: "p2", name: "Serum Y" },
      ],
      lots: [
        {
          id: "l1",
          productId: "p1",
          warehouseId: "wh-prin",
          branchId: "principal-id",
          currentQuantity: 10,
          expiresAt: "2027-01-01",
          receivedAt: "2026-01-01",
          lotNumber: "L1",
        },
        {
          id: "l2",
          productId: "p1",
          warehouseId: "wh-cutis",
          branchId: "cutis-id",
          currentQuantity: 3,
          expiresAt: "2027-02-01",
          receivedAt: "2026-02-01",
          lotNumber: "L2",
        },
      ],
    });

    const sources = await loadImportSources(ctx, repos);

    expect(sources.principalId).toBe("principal-id");
    expect(sources.cutisId).toBe("cutis-id");
    expect(sources.principalName).toBe("DermaLand Principal");
    expect(sources.cutisName).toBe("Dermaland Cutis");
    expect(sources.cutisWarehouseId).toBe("wh-cutis");
    expect(sources.products).toEqual([
      { id: "p1", name: "Crema X" },
      { id: "p2", name: "Serum Y" },
    ]);
    expect(sources.principalLots).toEqual([
      {
        id: "l1",
        productId: "p1",
        warehouseId: "wh-prin",
        quantity: 10,
        expiresAt: "2027-01-01",
        receivedAt: "2026-01-01",
        lotNumber: "L1",
      },
    ]);
    expect(sources.cutisLots).toEqual([
      {
        id: "l2",
        productId: "p1",
        warehouseId: "wh-cutis",
        quantity: 3,
        expiresAt: "2027-02-01",
        receivedAt: "2026-02-01",
        lotNumber: "L2",
      },
    ]);
  });

  it("pagina el catálogo de productos en vez de quedarse con la primera página (tope silencioso de PostgREST)", async () => {
    // Simula un catálogo de 1500 productos: si `loadImportSources` no pagina,
    // se corta en la primera página (tope 1000) y este test lo detecta.
    const totalProducts = 1500;
    const allProducts = Array.from({ length: totalProducts }, (_, i) => ({
      id: `p${i}`,
      name: `Producto ${i}`,
    }));
    const productList = vi.fn(
      async (_c: RepoContext, opts?: { limit?: number; offset?: number }) => {
        const offset = opts?.offset ?? 0;
        const limit = opts?.limit ?? 50;
        return allProducts.slice(offset, offset + limit);
      },
    );
    const repos = makeRepos({ productListImpl: productList });

    const sources = await loadImportSources(ctx, repos);

    expect(sources.products).toHaveLength(totalProducts);
    // Tuvo que pedir más de una página.
    expect(productList.mock.calls.length).toBeGreaterThan(1);
  });

  it("si Cutis no tiene almacén configurado, falla con un mensaje legible (no crea stock a ciegas)", async () => {
    const repos = makeRepos({ warehouses: [] });
    await expect(loadImportSources(ctx, repos)).rejects.toThrow(/almacén/i);
  });
});
