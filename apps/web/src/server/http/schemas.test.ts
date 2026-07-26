import { describe, it, expect } from "vitest";
import { catalogCreate, catalogEdit, createBody } from "./schemas";

describe("esquemas de validación de body (Regla 2)", () => {
  it("catalogCreate exige name no vacío", () => {
    expect(catalogCreate.safeParse({ name: "Producto X" }).success).toBe(true);
    expect(catalogCreate.safeParse({}).success).toBe(false);
    expect(catalogCreate.safeParse({ name: "   " }).success).toBe(false);
  });

  it("catalogCreate deja pasar campos extra (passthrough — el repo hace whitelisting)", () => {
    expect(
      catalogCreate.safeParse({ name: "X", price: 100, sku: "A1", extra: true }).success,
    ).toBe(true);
  });

  it("catalogEdit (PATCH) acepta actualización parcial (sin name)", () => {
    expect(catalogEdit.safeParse({ price: 50 }).success).toBe(true);
    expect(catalogEdit.safeParse({}).success).toBe(true);
  });

  it("rechaza strings absurdamente largas, incluso anidadas (anti-DoS)", () => {
    const huge = "a".repeat(6000);
    expect(catalogEdit.safeParse({ notes: huge }).success).toBe(false);
    expect(createBody([]).safeParse({ a: { b: huge } }).success).toBe(false);
  });

  it("rechaza body que no es objeto", () => {
    expect(catalogEdit.safeParse("texto plano").success).toBe(false);
    expect(catalogEdit.safeParse(42).success).toBe(false);
  });
});
