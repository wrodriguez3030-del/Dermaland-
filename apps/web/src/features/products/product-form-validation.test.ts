import { describe, it, expect } from "vitest";
import { validateProductForm, type ProductFormValues } from "./product-form-validation";

const base: ProductFormValues = {
  name: "Crema",
  price: "1250",
  itbisRate: "18",
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

  it("1. vacío marca los requeridos del producto (nombre, precio) — SKU NO", () => {
    const m = validateProductForm({ ...base, name: "", price: "" });
    expect(m).toContain("name");
    expect(m).toContain("price");
    expect(m).not.toContain("sku");
  });

  it("5. ITBIS 0% (Exento) cuenta como válido", () => {
    expect(validateProductForm({ ...base, itbisRate: "0" })).toEqual([]);
  });

  it("marca ITBIS solo si no es número", () => {
    expect(validateProductForm({ ...base, itbisRate: "" })).toContain("itbisRate");
  });

  it("6. lote inicial DESACTIVADO no exige campos de lote", () => {
    expect(validateProductForm({ ...base, withLot: false })).toEqual([]);
  });

  it("7-10. lote inicial ACTIVADO exige sucursal, número, cantidad>0 y fecha", () => {
    const m = validateProductForm({ ...base, withLot: true });
    expect(m).toEqual(expect.arrayContaining(["branchId", "lotNumber", "initialQuantity", "expiresAt"]));
  });

  it("9. cantidad inicial 0 es inválida; 11-12. '5' y fecha YYYY-MM-DD son válidos", () => {
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
