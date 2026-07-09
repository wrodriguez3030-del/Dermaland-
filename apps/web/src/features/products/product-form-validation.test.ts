import { describe, it, expect } from "vitest";
import {
  validateProductForm,
  skuTakenOnEdit,
  PRODUCT_FIELD_MESSAGES,
  type ProductFormValues,
} from "./product-form-validation";

const base: ProductFormValues = {
  name: "Crema",
  cost: "1000",
  itbisRate: "18",
  margin: "30",
  priceMode: "auto",
  price: "1534",
  unit: "unidad",
  withLot: false,
  lotBranch: "",
  lotNumber: "",
  lotQty: "",
  lotExpiry: "",
};

describe("validateProductForm", () => {
  it("13. producto válido sin lote inicial no tiene faltantes", () => {
    expect(validateProductForm(base)).toEqual([]);
  });

  it("1. vacío marca los requeridos del producto (nombre, costo) — SKU NO", () => {
    const m = validateProductForm({ ...base, name: "", cost: "" });
    expect(m).toContain("name");
    expect(m).toContain("cost");
    expect(m).not.toContain("sku");
  });

  it("13. costo negativo es inválido (mensaje específico)", () => {
    const m = validateProductForm({ ...base, cost: "-1" });
    expect(m).toContain("cost");
    expect(PRODUCT_FIELD_MESSAGES.cost).toBe("Ingresa el costo por unidad.");
  });

  it("14. margen inválido (>1000 o negativo) se marca", () => {
    expect(validateProductForm({ ...base, margin: "1001" })).toContain("margin");
    expect(validateProductForm({ ...base, margin: "-5" })).toContain("margin");
    expect(validateProductForm({ ...base, margin: "" })).toContain("margin");
  });

  it("8. margen 0% es válido", () => {
    expect(validateProductForm({ ...base, margin: "0", price: "1180" })).toEqual([]);
  });

  it("7. ITBIS 0% (Exento) cuenta como válido", () => {
    expect(validateProductForm({ ...base, itbisRate: "0", price: "1300" })).toEqual([]);
  });

  it("ITBIS no oficial (5%) es inválido", () => {
    expect(validateProductForm({ ...base, itbisRate: "5" })).toContain("itbisRate");
    expect(validateProductForm({ ...base, itbisRate: "" })).toContain("itbisRate");
  });

  it("precio manual vacío se marca; auto no depende del string de precio", () => {
    expect(validateProductForm({ ...base, priceMode: "manual", price: "" })).toContain("price");
    // auto con precio calculado válido → sin error
    expect(validateProductForm({ ...base, priceMode: "auto", price: "1534" })).not.toContain("price");
  });

  it("precio negativo o NaN nunca se acepta", () => {
    expect(validateProductForm({ ...base, price: "-10" })).toContain("price");
    expect(validateProductForm({ ...base, priceMode: "manual", price: "abc" })).toContain("price");
  });

  it("6. lote inicial DESACTIVADO no exige campos de lote", () => {
    expect(validateProductForm({ ...base, withLot: false })).toEqual([]);
  });

  it("7-10. lote inicial ACTIVADO exige sucursal, número, cantidad>0 y fecha", () => {
    const m = validateProductForm({ ...base, withLot: true });
    expect(m).toEqual(expect.arrayContaining(["branchId", "lotNumber", "initialQuantity", "expiresAt"]));
  });

  it("9. cantidad inicial 0 es inválida; '5' y fecha YYYY-MM-DD son válidos", () => {
    const bad = validateProductForm({ ...base, withLot: true, lotBranch: "b1", lotNumber: "L1", lotQty: "0", lotExpiry: "2027-01-01" });
    expect(bad).toContain("initialQuantity");
    const ok = validateProductForm({ ...base, withLot: true, lotBranch: "b1", lotNumber: "L1", lotQty: "5", lotExpiry: "2027-01-01" });
    expect(ok).toEqual([]);
  });

  it("14. producto válido con lote inicial completo no tiene faltantes", () => {
    const m = validateProductForm({ ...base, withLot: true, lotBranch: "br1", lotNumber: "LRP24A", lotQty: "24", lotExpiry: "2027-06-01" });
    expect(m).toEqual([]);
  });
});

describe("skuTakenOnEdit", () => {
  // Catálogo local (mock/localStorage): el mismo producto ISDIN existe con un id
  // mock, mientras que en Supabase su id es un UUID distinto.
  const catalog = [
    { id: "prod_isd_005", sku: "DERM-000201" },
    { id: "prod_isd_006", sku: "DERM-000202" },
  ];

  it("supabase: NO reporta duplicado aunque el catálogo mock tenga el mismo SKU con otro id (bug real de edición)", () => {
    expect(
      skuTakenOnEdit({
        backend: "supabase",
        products: catalog,
        sku: "DERM-000201",
        currentId: "8f2a7c1e-0000-4000-8000-000000000201", // UUID Supabase
      }),
    ).toBe(false);
  });

  it("local: reporta duplicado cuando OTRO producto (distinto id) tiene el mismo SKU", () => {
    expect(
      skuTakenOnEdit({
        backend: "local",
        products: [...catalog, { id: "prod_dupe", sku: "DERM-000201" }],
        sku: "DERM-000201",
        currentId: "prod_isd_005",
      }),
    ).toBe(true);
  });

  it("local: NO reporta duplicado cuando el único match es el propio producto (excluye id actual)", () => {
    expect(
      skuTakenOnEdit({
        backend: "local",
        products: catalog,
        sku: "DERM-000201",
        currentId: "prod_isd_005",
      }),
    ).toBe(false);
  });

  it("local: NO reporta duplicado cuando ningún producto comparte el SKU", () => {
    expect(
      skuTakenOnEdit({
        backend: "local",
        products: catalog,
        sku: "DERM-999999",
        currentId: "prod_isd_005",
      }),
    ).toBe(false);
  });

  it("recorta espacios del SKU antes de comparar", () => {
    expect(
      skuTakenOnEdit({
        backend: "local",
        products: [{ id: "a", sku: "DERM-000201" }],
        sku: "  DERM-000201  ",
        currentId: "b",
      }),
    ).toBe(true);
  });
});
