// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createProduct,
  deleteProduct,
  getProductByIdFromStore,
  listAllProducts,
  updateProduct,
  clearLocalProducts,
  saveProduct,
  deleteProductAnywhere,
  setProductActiveAnywhere,
  missingCreateProductFields,
  fetchProductsFromServer,
  fetchProductFromServer,
  useProductState,
  useProduct,
  PRODUCT_BACKEND,
} from "./product-store";
import { mockProducts } from "@/lib/mock-data/catalog";
import type { Product } from "@/types";

beforeEach(() => {
  window.localStorage.clear();
});

describe("product-store CRUD", () => {
  it("lista al menos el seed de productos", () => {
    expect(listAllProducts().length).toBeGreaterThanOrEqual(mockProducts.length);
  });

  it("crea un producto y aparece en la lista", () => {
    const before = listAllProducts().length;
    const r = createProduct({ sku: "TEST-001", name: "Crema test", price: 100 });
    expect(r.ok).toBe(true);
    expect(listAllProducts().length).toBe(before + 1);
    if (r.ok) {
      expect(getProductByIdFromStore(r.product.id)?.name).toBe("Crema test");
    }
  });

  it("ante SKU duplicado genera uno nuevo (no rechaza)", () => {
    const a = createProduct({ sku: "DERM-000100", name: "A", price: 10 });
    const b = createProduct({ sku: "DERM-000100", name: "B", price: 20 });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.product.sku).not.toBe(b.product.sku);
  });

  it("genera SKU secuencial automático cuando viene vacío", () => {
    const r = createProduct({ sku: "", name: "Crema auto", price: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.product.sku).toMatch(/^DERM-\d{6}$/);
  });

  it("missingCreateProductFields: NUNCA exige sku (regresión bug supabase); solo name/price", () => {
    // Regresión: la ruta de servidor exigía sku y bloqueaba SIEMPRE la creación
    // en producción ("Complete los campos requeridos.") con SKU vacío.
    expect(missingCreateProductFields({ name: "Crema", price: 100 })).toEqual([]);
    expect(missingCreateProductFields({ name: "", price: NaN as number })).toEqual([
      "name",
      "price",
    ]);
    expect(missingCreateProductFields({ name: "", price: NaN as number })).not.toContain("sku");
    // ITBIS 0 / precio 0 no son "missing" (0 es válido, no null/NaN).
    expect(missingCreateProductFields({ name: "Gratis", price: 0 })).toEqual([]);
  });

  it("rechaza alta sin campos requeridos (nombre/precio), NO por SKU", () => {
    const r = createProduct({ sku: "", name: "", price: NaN as number });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missingFields).toContain("name");
      expect(r.missingFields).not.toContain("sku");
    }
  });

  it("edita un producto del seed vía override (nombre y precio)", () => {
    const seed = mockProducts[0]!;
    updateProduct(seed.id, { name: "Nombre editado", price: 9999 });
    const after = getProductByIdFromStore(seed.id);
    expect(after?.name).toBe("Nombre editado");
    expect(after?.price).toBe(9999);
  });

  it("inactiva y reactiva un producto", () => {
    const seed = mockProducts[0]!;
    updateProduct(seed.id, { active: false });
    expect(getProductByIdFromStore(seed.id)?.active).toBe(false);
    updateProduct(seed.id, { active: true });
    expect(getProductByIdFromStore(seed.id)?.active).toBe(true);
  });

  it("soft-delete: el producto del seed sale de la lista pero no se borra el seed base", () => {
    const seed = mockProducts[0]!;
    deleteProduct(seed.id);
    expect(getProductByIdFromStore(seed.id)).toBeUndefined();
    // El seed base sigue intacto en memoria (no se borra físicamente).
    expect(mockProducts.find((p) => p.id === seed.id)).toBeDefined();
  });

  it("eliminar un producto nuevo lo quita por completo", () => {
    const r = createProduct({ sku: "NEW-DEL", name: "Temporal", price: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      deleteProduct(r.product.id);
      expect(getProductByIdFromStore(r.product.id)).toBeUndefined();
    }
  });

  it("clearLocalProducts deja sólo el seed", () => {
    createProduct({ sku: "X1", name: "X", price: 1 });
    clearLocalProducts();
    expect(listAllProducts().length).toBe(mockProducts.length);
  });
});

describe("product-store wrappers (modo local)", () => {
  beforeEach(() => { window.localStorage.clear(); clearLocalProducts(); });

  it("PRODUCT_BACKEND es 'local' sin NEXT_PUBLIC_DATA_SOURCE=supabase", () => {
    expect(PRODUCT_BACKEND).toBe("local");
  });

  it("saveProduct('create') agrega al store local", async () => {
    const res = await saveProduct("create", { sku: "WRAP-1", name: "Wrap", price: 99 });
    expect(res.ok).toBe(true);
    expect(listAllProducts().some((p) => p.sku === "WRAP-1")).toBe(true);
  });

  it("deleteProductAnywhere borra del store local", async () => {
    const created = await saveProduct("create", { sku: "WRAP-2", name: "Wrap2", price: 10 });
    if (!created.ok) throw new Error("setup");
    const del = await deleteProductAnywhere(created.product.id);
    expect(del.ok).toBe(true);
    expect(listAllProducts().some((p) => p.id === created.product.id)).toBe(false);
  });
});

// ─── Lectura desde el servidor (regresión "Producto no encontrado" tras crear) ──
//
// Con >1000 productos, el fetch viejo de UNA página (?limit=1000, orden por
// nombre) dejaba fuera todo lo que ordenara después de la posición 1000: el
// detalle buscaba el producto recién creado en esa lista y mostraba "Producto
// no encontrado" aunque el insert fue correcto. Ahora: lista paginada completa
// + lectura por id directa.

function fakeProduct(i: number): Product {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    businessId: "biz-1",
    sku: `DERM-${String(i).padStart(6, "0")}`,
    name: `Producto ${i}`,
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
    createdAt: "2026-07-02T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  } as Product;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("fetchProductsFromServer (paginado)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("trae TODAS las páginas cuando hay más de 1000 productos", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => fakeProduct(i));
    const page2 = Array.from({ length: 355 }, (_, i) => fakeProduct(1000 + i));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ products: page1 }))
      .mockResolvedValueOnce(jsonResponse({ products: page2 }));
    vi.stubGlobal("fetch", fetchMock);

    const all = await fetchProductsFromServer();
    expect(all).toHaveLength(1355);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("offset=0");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("offset=1000");
    // El producto "invisible" con el fetch viejo ahora está en la lista.
    expect(all.some((p) => p.id === page2[354]!.id)).toBe(true);
  });

  it("con una página corta hace un solo request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ products: [fakeProduct(1)] }));
    vi.stubGlobal("fetch", fetchMock);
    const all = await fetchProductsFromServer();
    expect(all).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propaga el error del servidor (no inventa lista)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 500)),
    );
    await expect(fetchProductsFromServer()).rejects.toThrow("boom");
  });
});

describe("fetchProductFromServer (lectura por id)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("devuelve el producto cuando existe", async () => {
    const p = fakeProduct(7);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ product: p })));
    const got = await fetchProductFromServer(p.id);
    expect(got?.id).toBe(p.id);
  });

  it("devuelve null en 404 (no existe / otro negocio)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Producto no encontrado." }, 404)),
    );
    expect(await fetchProductFromServer("otro-id")).toBeNull();
  });

  it("lanza en errores que no son 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "server" }, 500)),
    );
    await expect(fetchProductFromServer("x")).rejects.toThrow("server");
  });
});

describe("useProductState / useProduct", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearLocalProducts();
  });

  it("modo local: resuelve el producto recién creado sin quedarse cargando", async () => {
    const r = createProduct({ sku: "", name: "Recién creado", price: 50 });
    if (!r.ok) throw new Error("setup");
    const { result } = renderHook(() => useProductState(r.product.id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.product?.name).toBe("Recién creado");
  });

  it("modo local: id inexistente termina en not-found (loading=false, sin producto)", async () => {
    const { result } = renderHook(() => useProductState("no-existe"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.product).toBeUndefined();
  });

  it("useProduct conserva el contrato viejo (Product | undefined)", async () => {
    const r = createProduct({ sku: "", name: "Contrato", price: 5 });
    if (!r.ok) throw new Error("setup");
    const { result } = renderHook(() => useProduct(r.product.id));
    await waitFor(() => expect(result.current?.name).toBe("Contrato"));
  });
});

describe("setProductActiveAnywhere (modo local)", () => {
  it("inactiva un producto del seed vía override local", async () => {
    const all = listAllProducts();
    const target = all[0]!;
    const res = await setProductActiveAnywhere(target.id, false);
    expect(res.ok).toBe(true);
    const after = listAllProducts().find((p) => p.id === target.id);
    expect(after?.active).toBe(false);
  });
});
