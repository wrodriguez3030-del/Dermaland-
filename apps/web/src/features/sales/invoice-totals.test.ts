import { describe, it, expect } from "vitest";
import { invoiceDisplayTotals } from "./invoice-totals";

describe("invoiceDisplayTotals", () => {
  it("sin descuento: base sin ITBIS + ITBIS = Total (y base ≠ total)", () => {
    // Precio ITBIS-incluido: 1 × RD$1,990 con ITBIS 303.56 dentro.
    const t = invoiceDisplayTotals({
      items: [{ unitPrice: 1990, quantity: 1 }],
      total: 1990,
      itbis: 303.56,
    });
    expect(t.grossInclusive).toBe(1990);
    expect(t.itbisIncluded).toBe(303.56);
    expect(t.baseWithoutItbis).toBe(1686.44);
    expect(t.discountInclusive).toBe(0);
    expect(t.total).toBe(1990);
    // El desglose SUMA y no repite el total.
    expect(t.baseWithoutItbis + t.itbisIncluded).toBeCloseTo(t.total, 2);
    expect(t.baseWithoutItbis).not.toBe(t.total);
  });

  it("con descuento: el bruto ya difiere del total", () => {
    const t = invoiceDisplayTotals({
      items: [{ unitPrice: 1000, quantity: 2 }],
      total: 1800,
      itbis: 274.58,
      discountPercent: 10,
    });
    expect(t.grossInclusive).toBe(2000);
    expect(t.discountInclusive).toBe(200);
    expect(t.discountPercent).toBe(10);
    expect(t.baseWithoutItbis).toBe(1525.42);
    expect(t.total).toBe(1800);
    expect(t.baseWithoutItbis + t.itbisIncluded).toBeCloseTo(t.total, 2);
  });
});
