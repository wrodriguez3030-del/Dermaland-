import { describe, it, expect } from "vitest";
import { availabilityFrom, isSellableForWeb } from "./availability";

const HOY = "2026-08-03";

describe("availabilityFrom", () => {
  it("con existencias dice 'En existencia'", () => {
    expect(availabilityFrom(12)).toEqual({
      status: "in_stock",
      label: "En existencia",
    });
  });

  it("sin existencias dice 'Agotado'", () => {
    expect(availabilityFrom(0)).toEqual({ status: "out_of_stock", label: "Agotado" });
  });

  it("una cantidad negativa se trata como agotado, no como error", () => {
    expect(availabilityFrom(-3).status).toBe("out_of_stock");
  });

  it("NUNCA expone la cantidad: el objeto solo tiene estado y etiqueta", () => {
    const salida = availabilityFrom(47);
    expect(Object.keys(salida).sort()).toEqual(["label", "status"]);
    expect(JSON.stringify(salida)).not.toContain("47");
  });

  it("la etiqueta es texto, no solo color (regla de accesibilidad)", () => {
    expect(availabilityFrom(1).label.trim().length).toBeGreaterThan(0);
    expect(availabilityFrom(0).label.trim().length).toBeGreaterThan(0);
  });
});

describe("isSellableForWeb", () => {
  it("cuenta un lote disponible con existencias y sin vencer", () => {
    expect(
      isSellableForWeb(
        { status: "available", currentQuantity: 5, expiresAt: "2027-01-01" },
        HOY,
      ),
    ).toBe(true);
  });

  it("descarta el lote vencido", () => {
    expect(
      isSellableForWeb(
        { status: "available", currentQuantity: 5, expiresAt: "2026-08-02" },
        HOY,
      ),
    ).toBe(false);
  });

  it("un lote que vence hoy todavía cuenta", () => {
    expect(
      isSellableForWeb(
        { status: "available", currentQuantity: 5, expiresAt: HOY },
        HOY,
      ),
    ).toBe(true);
  });

  it("descarta cuarentena, retirado, dañado y devuelto", () => {
    for (const status of ["quarantine", "recalled", "damaged", "returned", "expired"]) {
      expect(
        isSellableForWeb({ status, currentQuantity: 9, expiresAt: "2027-01-01" }, HOY),
      ).toBe(false);
    }
  });

  it("descarta el lote sin existencias", () => {
    expect(
      isSellableForWeb(
        { status: "available", currentQuantity: 0, expiresAt: "2027-01-01" },
        HOY,
      ),
    ).toBe(false);
  });
});
