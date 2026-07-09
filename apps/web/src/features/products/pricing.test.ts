import { describe, it, expect } from "vitest";
import {
  DEFAULT_MARGIN_PERCENT,
  costWithItbis,
  roundSalePrice,
  computeSalePrice,
  realMarginPercent,
  marginAmount,
  deriveMarginPercent,
  pricingBreakdown,
  isValidCost,
  isValidMargin,
  isValidItbis,
  canOverrideSalePrice,
  type RoundingMode,
} from "./pricing";

describe("pricing — costWithItbis", () => {
  it("aplica ITBIS 18% sobre el costo (1000 → 1180)", () => {
    expect(costWithItbis(1000, 18)).toBe(1180);
  });
  it("ITBIS 0% (exento) deja el costo igual (1000 → 1000)", () => {
    expect(costWithItbis(1000, 0)).toBe(1000);
  });
  it("ITBIS 16% (850 → 986)", () => {
    expect(costWithItbis(850, 16)).toBeCloseTo(986, 5);
  });
});

describe("pricing — computeSalePrice (fórmula de negocio)", () => {
  it("6/CASO A. Costo 1000 + ITBIS 18% + Margen 30% = 1534.00", () => {
    expect(computeSalePrice({ cost: 1000, itbisRate: 18, marginPercent: 30 })).toBe(1534);
  });
  it("CASO B. Costo 1000 + ITBIS 0% + Margen 30% = 1300.00", () => {
    expect(computeSalePrice({ cost: 1000, itbisRate: 0, marginPercent: 30 })).toBe(1300);
  });
  it("CASO C. Costo 850 + ITBIS 18% + Margen 30% = 1303.90", () => {
    expect(computeSalePrice({ cost: 850, itbisRate: 18, marginPercent: 30 })).toBe(1303.9);
  });
  it("8. Margen 0% devuelve el costo con ITBIS (1000 + 18% → 1180)", () => {
    expect(computeSalePrice({ cost: 1000, itbisRate: 18, marginPercent: 0 })).toBe(1180);
  });
  it("7. ITBIS 0% + Margen 0% devuelve el costo (1000 → 1000)", () => {
    expect(computeSalePrice({ cost: 1000, itbisRate: 0, marginPercent: 0 })).toBe(1000);
  });
  it("redondea a 2 decimales por defecto", () => {
    // 333.33 * 1.18 * 1.30 = 511.32882 → 511.33
    expect(computeSalePrice({ cost: 333.33, itbisRate: 18, marginPercent: 30 })).toBe(511.33);
  });
  it("costo 0 devuelve 0", () => {
    expect(computeSalePrice({ cost: 0, itbisRate: 18, marginPercent: 30 })).toBe(0);
  });
});

describe("pricing — redondeo comercial", () => {
  const cases: Array<[RoundingMode, number]> = [
    ["none", 1303.9],
    ["integer", 1304],
    ["multiple5", 1305],
    ["multiple10", 1300],
  ];
  it.each(cases)("modo %s redondea 1303.90 → %s", (mode, expected) => {
    expect(roundSalePrice(1303.9, mode)).toBe(expected);
  });

  it("computeSalePrice respeta el modo de redondeo (multiple5)", () => {
    // 850 * 1.18 * 1.30 = 1303.90 → múltiplo de 5 = 1305
    expect(
      computeSalePrice({ cost: 850, itbisRate: 18, marginPercent: 30, rounding: "multiple5" }),
    ).toBe(1305);
  });
});

describe("pricing — realMarginPercent (11)", () => {
  it("Precio 1300, costo con ITBIS 1180 → 10.169...%", () => {
    expect(realMarginPercent(1300, 1000, 18)).toBeCloseTo(10.16949, 4);
  });
  it("precio auto 1534 devuelve ~30%", () => {
    expect(realMarginPercent(1534, 1000, 18)).toBeCloseTo(30, 5);
  });
  it("costo con ITBIS 0 devuelve null (evita división por cero / infinito)", () => {
    expect(realMarginPercent(1300, 0, 18)).toBeNull();
  });
  it("margen real puede ser negativo si el precio es menor al costo con ITBIS", () => {
    expect(realMarginPercent(1000, 1000, 18)).toBeCloseTo(-15.254, 3);
  });
});

describe("pricing — marginAmount (utilidad estimada)", () => {
  it("Precio 1534 - costo con ITBIS 1180 = 354 (utilidad por unidad)", () => {
    expect(marginAmount(1534, 1000, 18)).toBe(354);
  });
});

describe("pricing — deriveMarginPercent (pre-llenado al editar)", () => {
  it("de un precio auto recupera el margen configurado (1534 → 30%)", () => {
    expect(deriveMarginPercent(1534, 1000, 18)).toBeCloseTo(30, 5);
  });
  it("costo 0 devuelve el margen por defecto (30%)", () => {
    expect(deriveMarginPercent(1534, 0, 18)).toBe(DEFAULT_MARGIN_PERCENT);
  });
  it("round-trip estable: derivar y recomputar reproduce el mismo precio", () => {
    const margin = deriveMarginPercent(1303.9, 850, 18);
    expect(computeSalePrice({ cost: 850, itbisRate: 18, marginPercent: margin })).toBe(1303.9);
  });
});

describe("pricing — pricingBreakdown (preview §6)", () => {
  it("desglosa CASO A completo", () => {
    const b = pricingBreakdown({ cost: 1000, itbisRate: 18, marginPercent: 30 });
    expect(b.cost).toBe(1000);
    expect(b.itbisAmount).toBe(180);
    expect(b.costWithItbis).toBe(1180);
    expect(b.marginAmount).toBe(354);
    expect(b.salePrice).toBe(1534);
  });
});

describe("pricing — validaciones (12/13/14)", () => {
  it("costo: rechaza negativo, NaN; acepta 0 y positivos", () => {
    expect(isValidCost(0)).toBe(true);
    expect(isValidCost(1000)).toBe(true);
    expect(isValidCost(-1)).toBe(false);
    expect(isValidCost(Number.NaN)).toBe(false);
    expect(isValidCost(Number.POSITIVE_INFINITY)).toBe(false);
  });
  it("margen: rechaza negativo, >1000, NaN; acepta 0..1000 y decimales", () => {
    expect(isValidMargin(0)).toBe(true);
    expect(isValidMargin(30)).toBe(true);
    expect(isValidMargin(30.5)).toBe(true);
    expect(isValidMargin(1000)).toBe(true);
    expect(isValidMargin(-1)).toBe(false);
    expect(isValidMargin(1001)).toBe(false);
    expect(isValidMargin(Number.NaN)).toBe(false);
  });
  it("itbis: solo acepta valores oficiales 0/16/18", () => {
    expect(isValidItbis(0)).toBe(true);
    expect(isValidItbis(16)).toBe(true);
    expect(isValidItbis(18)).toBe(true);
    expect(isValidItbis(5)).toBe(false);
    expect(isValidItbis(Number.NaN)).toBe(false);
  });
});

describe("pricing — canOverrideSalePrice (10. permiso ADMIN)", () => {
  it("admin y super_admin pueden; cajero/vendedor no", () => {
    expect(canOverrideSalePrice("admin")).toBe(true);
    expect(canOverrideSalePrice("super_admin")).toBe(true);
    expect(canOverrideSalePrice("cashier")).toBe(false);
    expect(canOverrideSalePrice("vendedor")).toBe(false);
  });
});
