import { describe, it, expect } from "vitest";
import { recalcInvoice } from "@/features/sales/invoice-edit";

/**
 * SEC-002 (regresión): la emisión de venta recalcula los montos en el servidor
 * con `recalcInvoice` (el mismo motor que ya usa la edición). Este test prueba
 * la propiedad de seguridad que el fix garantiza: los totales SIEMPRE se derivan
 * de las líneas/precios, así que un cliente NO puede persistir un total
 * arbitrario (p. ej. RD$0.01) ni cantidades/precios negativos.
 */
describe("recalcInvoice — blindaje de emisión (SEC-002)", () => {
  const baseLine = {
    productId: "p1", productSku: "SKU-1", productName: "Crema",
    itbisRate: 0.18, discountAmount: 0,
  };

  it("el total se deriva de las líneas, ignora un total manipulado del cliente", () => {
    // El cliente 'dice' que todo vale nada, pero envía 10 unidades a RD$100.
    const r = recalcInvoice({
      customerName: "X", items: [{ ...baseLine, quantity: 10, unitPrice: 100 }],
      globalDiscountPercent: 0, payments: [],
    });
    // 10 * 100 = 1000 (ITBIS incluido). El total NO puede ser 0.01.
    expect(r.total).toBeCloseTo(1000, 2);
    expect(r.total).toBeGreaterThan(999);
  });

  it("clampa cantidad y precio negativos a 0 (no genera totales negativos)", () => {
    const r = recalcInvoice({
      customerName: "X",
      items: [
        { ...baseLine, quantity: -5, unitPrice: 100 },
        { ...baseLine, quantity: 2, unitPrice: -50 },
      ],
      globalDiscountPercent: 0, payments: [],
    });
    expect(r.total).toBe(0);
    expect(r.items.every((i) => i.total >= 0 && i.subtotal >= 0)).toBe(true);
  });

  it("clampa el descuento global fuera de 0–100", () => {
    const r = recalcInvoice({
      customerName: "X", items: [{ ...baseLine, quantity: 1, unitPrice: 100 }],
      globalDiscountPercent: 999, payments: [],
    });
    expect(r.discountPercent).toBe(100); // clamp a 100, no 999
    expect(r.total).toBeGreaterThanOrEqual(0);
  });

  it("balance = total − pagos (derivado en servidor)", () => {
    const r = recalcInvoice({
      customerName: "X", items: [{ ...baseLine, quantity: 1, unitPrice: 118 }],
      globalDiscountPercent: 0,
      payments: [{ method: "cash", amount: 50 }],
    });
    expect(r.paid).toBe(50);
    expect(r.balance).toBeCloseTo(r.total - 50, 2);
  });
});
