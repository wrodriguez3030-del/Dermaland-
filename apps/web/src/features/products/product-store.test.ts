// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  createProduct,
  deleteProduct,
  getProductByIdFromStore,
  listAllProducts,
  updateProduct,
  clearLocalProducts,
} from "./product-store";
import { mockProducts } from "@/lib/mock-data/catalog";

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

  it("rechaza SKU duplicado", () => {
    createProduct({ sku: "DUP-1", name: "A", price: 10 });
    const r = createProduct({ sku: "DUP-1", name: "B", price: 20 });
    expect(r.ok).toBe(false);
  });

  it("rechaza alta sin campos requeridos", () => {
    const r = createProduct({ sku: "", name: "", price: NaN as number });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missingFields).toContain("sku");
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
