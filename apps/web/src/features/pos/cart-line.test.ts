import { describe, expect, it } from "vitest";
import {
  lineAmounts,
  lineDiscountInclusive,
  cartTotals,
  validateLineDiscount,
  type CartLineInput,
} from "./cart-line";

const base = (over: Partial<CartLineInput> = {}): CartLineInput => ({
  unitPrice: 118, // 100 base + 18% ITBIS
  itbisRate: 18,
  quantity: 1,
  discountType: "none",
  discountValue: 0,
  ...over,
});

describe("cart-line — descuento por producto", () => {
  it("sin descuento: base/itbis/total correctos (precio inclusivo)", () => {
    const a = lineAmounts(base({ quantity: 2 }));
    expect(a.grossInclusive).toBe(236);
    expect(a.grossBase).toBe(200);
    expect(a.itbis).toBe(36);
    expect(a.total).toBe(236);
    expect(a.discountBase).toBe(0);
  });

  it("descuento porcentaje 10% recalcula descuento, base, ITBIS y total", () => {
    const a = lineAmounts(base({ quantity: 1, discountType: "percent", discountValue: 10 }));
    expect(a.discountInclusive).toBe(11.8); // 10% de 118
    expect(a.total).toBe(106.2); // 118 - 11.8
    expect(a.netBase).toBe(90); // 106.2 / 1.18
    expect(a.itbis).toBe(16.2); // 90 * 0.18
    expect(a.discountBase).toBe(10); // 100 - 90
  });

  it("descuento monto fijo RD$ se aplica al precio visible", () => {
    const a = lineAmounts(base({ unitPrice: 850, itbisRate: 18, quantity: 1, discountType: "amount", discountValue: 100 }));
    expect(a.discountInclusive).toBe(100);
    expect(a.total).toBe(750);
  });

  it("no permite porcentaje > 100", () => {
    expect(validateLineDiscount("percent", 150, 118, 1).ok).toBe(false);
    expect(validateLineDiscount("percent", 150, 118, 1).error).toMatch(/100/);
  });

  it("no permite monto mayor al subtotal de la línea", () => {
    expect(validateLineDiscount("amount", 500, 118, 1).ok).toBe(false);
    expect(validateLineDiscount("amount", 500, 118, 1).error).toMatch(/mayor al subtotal/i);
  });

  it("no permite descuento negativo", () => {
    expect(validateLineDiscount("percent", -5, 118, 1).ok).toBe(false);
  });

  it("producto sin precio: no se puede aplicar descuento", () => {
    expect(validateLineDiscount("amount", 50, 0, 1).ok).toBe(false);
    expect(validateLineDiscount("amount", 50, 0, 1).error).toMatch(/sin precio/i);
    expect(lineDiscountInclusive(base({ unitPrice: 0, discountType: "amount", discountValue: 50 }))).toBe(0);
  });

  it("nunca deja total negativo (clamp del monto al bruto)", () => {
    const a = lineAmounts(base({ discountType: "amount", discountValue: 99999 }));
    expect(a.total).toBeGreaterThanOrEqual(0);
    expect(a.discountInclusive).toBeLessThanOrEqual(a.grossInclusive);
  });

  it("totales del carrito: bruto, descuentos por producto, ITBIS, total", () => {
    const lines: CartLineInput[] = [
      base({ unitPrice: 118, quantity: 10, discountType: "percent", discountValue: 10 }), // 1180 → -118
      base({ unitPrice: 118, quantity: 1 }),
    ];
    const t = cartTotals(lines, 0);
    expect(t.subtotalBruto).toBe(1100); // (1180+118)/1.18 = 1100
    expect(t.lineDiscounts).toBe(100); // 10% de 1000 base
    expect(t.subtotalNeto).toBe(1000);
    expect(t.itbis).toBe(180); // 1000 * 0.18
    expect(t.total).toBe(1180);
  });

  it("el descuento global sigue funcionando (sobre la base neta)", () => {
    const lines: CartLineInput[] = [base({ unitPrice: 118, quantity: 10 })]; // base 1000
    const t = cartTotals(lines, 10); // -10% global
    expect(t.subtotalNeto).toBe(1000);
    expect(t.globalDiscount).toBe(100);
    expect(t.itbis).toBe(162); // (900)*0.18
    expect(t.total).toBe(1062);
  });
});
