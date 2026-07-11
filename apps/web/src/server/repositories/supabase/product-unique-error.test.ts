import { describe, it, expect } from "vitest";
import { pgUniqueConstraint } from "./client";
import { productUniqueMessage } from "./product";

// Errores tal como los devuelve Postgres/PostgREST para una violación única.
const barcodeErr = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "products_barcode_live_unique"',
  details: "Key (business_id, barcode)=(…, 8436574360677) already exists.",
};
const skuErr = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "products_business_sku_live_unique"',
  details: "Key (business_id, sku)=(…, DERM-000002) already exists.",
};

describe("pgUniqueConstraint — extrae el nombre de la constraint", () => {
  it("desde el mensaje", () => {
    expect(pgUniqueConstraint(barcodeErr)).toBe("products_barcode_live_unique");
  });
  it("desde el campo `constraint` si viene", () => {
    expect(pgUniqueConstraint({ constraint: "products_barcode_live_unique" })).toBe(
      "products_barcode_live_unique",
    );
  });
  it("undefined si no hay nada reconocible", () => {
    expect(pgUniqueConstraint({ message: "boom" })).toBeUndefined();
  });
});

describe("productUniqueMessage — mensaje por-campo (§5)", () => {
  it("barcode duplicado → menciona el código, no el genérico", () => {
    const m = productUniqueMessage(barcodeErr, "8436574360677");
    expect(m).toBe(
      "El código de barra 8436574360677 ya está asignado a otro producto.",
    );
    expect(m).not.toMatch(/Ya existe un registro con esos datos/);
  });

  it("SKU duplicado → mensaje de SKU", () => {
    expect(productUniqueMessage(skuErr)).toBe("Ya existe otro producto con este SKU.");
  });

  it("null cuando no es 23505 (no confundir otros errores con duplicado)", () => {
    expect(productUniqueMessage({ code: "23503", message: "fk" })).toBeNull();
    expect(productUniqueMessage(null)).toBeNull();
  });

  it("NUNCA expone detalles técnicos (23505, constraint, SQL, PGRST, UUID)", () => {
    for (const m of [
      productUniqueMessage(barcodeErr, "8436574360677"),
      productUniqueMessage(skuErr),
    ]) {
      expect(m).toBeTruthy();
      expect(m!).not.toMatch(/23505|constraint|products_|PGRST|Supabase|violates|Key \(/i);
      // sin UUID
      expect(m!).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
    }
  });
});
