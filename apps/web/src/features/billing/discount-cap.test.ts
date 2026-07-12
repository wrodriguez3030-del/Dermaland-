import { describe, it, expect } from "vitest";
import { maxDiscountPercentForRole } from "./permissions";

/**
 * SEC-012 (regresión): tope de descuento global por rol, validado en el
 * servidor. Admin/gerencia sin tope; cajero acotado.
 */
describe("maxDiscountPercentForRole — SEC-012", () => {
  it("admin y super_admin sin tope (100%)", () => {
    expect(maxDiscountPercentForRole("admin")).toBe(100);
    expect(maxDiscountPercentForRole("super_admin")).toBe(100);
  });
  it("manager y supervisor sin tope", () => {
    expect(maxDiscountPercentForRole("manager")).toBe(100);
    expect(maxDiscountPercentForRole("supervisor")).toBe(100);
  });
  it("cajero acotado (< 100)", () => {
    const cap = maxDiscountPercentForRole("cashier");
    expect(cap).toBeLessThan(100);
    expect(cap).toBeGreaterThan(0);
  });
});
