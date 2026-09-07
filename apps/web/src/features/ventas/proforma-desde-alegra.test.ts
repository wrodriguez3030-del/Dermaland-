import { describe, it, expect } from "vitest";
import { proformaDesdeAlegra, METODO_PAGO_ALEGRA } from "./proforma-desde-alegra";
import { invoiceDisplayTotals } from "@/features/sales/invoice-totals";
import type { FacturaAlegraCompleta, LineaAlegra } from "@/server/services/alegra/factura-completa";

/**
 * `factura()`/`linea()`: constructores de prueba con valores por defecto
 * coherentes (1 línea de 118 con ITBIS 18, sobre 100 sin ITBIS). Cuando se
 * pasan `lineas` sin tocar el total/itbis/subtotal de cabecera, éstos se
 * recalculan a partir de las líneas — así una prueba que solo cambia la
 * línea no queda con una cabecera que no cuadra con ella (igual que en
 * Alegra real, donde la cabecera SIEMPRE es la suma de sus líneas).
 */
function linea(overrides: Partial<LineaAlegra> = {}): LineaAlegra {
  return {
    lineNo: 1,
    productId: "prod-1",
    name: "Crema hidratante",
    quantity: 1,
    unitPrice: 100,
    discount: 0,
    itbis: 18,
    total: 118,
    ...overrides,
  };
}

function factura(
  overrides: Partial<FacturaAlegraCompleta> = {},
): FacturaAlegraCompleta {
  const lineas = overrides.lineas ?? [linea()];
  const subtotal = lineas.reduce((s, l) => s + (l.total - l.itbis), 0);
  const itbis = lineas.reduce((s, l) => s + l.itbis, 0);
  const total = lineas.reduce((s, l) => s + l.total, 0);
  return {
    id: "f-1",
    ncf: "B0200012345",
    ncfPrefix: "B02",
    date: "2026-09-01",
    issuedAt: "2026-09-01T10:00:00Z",
    status: "closed",
    clientId: "cli-1",
    clientName: "Ana Pérez",
    clientDocument: "00112223334",
    branchId: "suc-1",
    sellerName: "Heidi",
    paymentMethod: "cash",
    subtotal,
    discount: 0,
    itbis,
    total,
    lineas,
    ...overrides,
  };
}

const NEGOCIO = "biz-1";

describe("adaptador FacturaAlegraCompleta → Proforma", () => {
  it("🔴 unitPrice lleva el ITBIS: total de línea / cantidad", () => {
    const p = proformaDesdeAlegra(
      factura({ lineas: [linea({ quantity: 2, unitPrice: 100, itbis: 36, total: 236 })] }),
      NEGOCIO,
    );
    expect(p.items[0]?.unitPrice).toBe(118); // no 100
    expect(invoiceDisplayTotals(p).total).toBeCloseTo(236, 2);
  });

  it("el total que imprime el ticket (dos líneas) cuadra con el total de Alegra", () => {
    const f = factura({
      lineas: [
        linea({ lineNo: 1, quantity: 2, unitPrice: 100, itbis: 36, total: 236 }),
        linea({ lineNo: 2, quantity: 1, unitPrice: 250, itbis: 45, total: 295 }),
      ],
    });
    const p = proformaDesdeAlegra(f, NEGOCIO);
    expect(invoiceDisplayTotals(p).total).toBeCloseTo(f.total, 2); // 531
  });

  it("es una FACTURA NCF, nunca e-CF", () => {
    const p = proformaDesdeAlegra(factura({ ncf: "B0200012345", ncfPrefix: "B02" }), NEGOCIO);
    expect(p.documentKind).toBe("invoice");
    expect(p.ecfType).toBeUndefined();
    expect(p.sequenceType).toBe("consumo");
    expect(p.number).toBe("B0200012345");
  });

  it("B01 → crédito fiscal", () => {
    const p = proformaDesdeAlegra(factura({ ncfPrefix: "B01" }), NEGOCIO);
    expect(p.sequenceType).toBe("credito_fiscal");
    expect(p.billingType).toBe("credito_fiscal");
  });

  it("B02, o un prefijo desconocido/nulo, → consumo", () => {
    expect(proformaDesdeAlegra(factura({ ncfPrefix: "B02" }), NEGOCIO).billingType).toBe("consumo");
    expect(proformaDesdeAlegra(factura({ ncfPrefix: null }), NEGOCIO).sequenceType).toBe("consumo");
  });

  it("cajero = vendedor de Alegra, o «Alegra» si no consta", () => {
    expect(proformaDesdeAlegra(factura({ sellerName: "Heidi" }), NEGOCIO).cashierName).toBe("Heidi");
    expect(proformaDesdeAlegra(factura({ sellerName: null }), NEGOCIO).cashierName).toBe("Alegra");
  });

  // ── Estado (Hechos verificados en producción, 07/09): tres casos, no dos ──
  it("cerrada → pagada (paid = total, balance = 0)", () => {
    const p = proformaDesdeAlegra(factura({ status: "closed", total: 118, lineas: [linea()] }), NEGOCIO);
    expect(p.status).toBe("paid");
    expect(p.paid).toBe(p.total);
    expect(p.balance).toBe(0);
  });

  it("anulada (void) → cancelled", () => {
    expect(proformaDesdeAlegra(factura({ status: "void" }), NEGOCIO).status).toBe("cancelled");
  });

  it("abierta (open, son las de CxC) → issued (paid = 0, balance = total)", () => {
    const p = proformaDesdeAlegra(factura({ status: "open" }), NEGOCIO);
    expect(p.status).toBe("issued");
    expect(p.paid).toBe(0);
    expect(p.balance).toBe(p.total);
  });

  it("método de pago conocido → un pago por el total", () => {
    expect(proformaDesdeAlegra(factura({ paymentMethod: "cash", total: 236 }), NEGOCIO).payments).toEqual([
      expect.objectContaining({ method: "cash", amount: 236 }),
    ]);
    expect(
      proformaDesdeAlegra(factura({ paymentMethod: "credit-card", total: 236 }), NEGOCIO).payments,
    ).toEqual([expect.objectContaining({ method: "card", amount: 236 })]);
    expect(
      proformaDesdeAlegra(factura({ paymentMethod: "debit-card", total: 236 }), NEGOCIO).payments,
    ).toEqual([expect.objectContaining({ method: "card", amount: 236 })]);
  });

  it("crédito-venta (queda en CxC, no es un pago), nulo o desconocido → sin pagos", () => {
    expect(proformaDesdeAlegra(factura({ paymentMethod: "credit-sell" }), NEGOCIO).payments).toEqual([]);
    expect(proformaDesdeAlegra(factura({ paymentMethod: null }), NEGOCIO).payments).toEqual([]);
    expect(proformaDesdeAlegra(factura({ paymentMethod: "inventado" }), NEGOCIO).payments).toEqual([]);
  });

  it("METODO_PAGO_ALEGRA solo trae los tres métodos reales que SÍ son un pago", () => {
    expect(METODO_PAGO_ALEGRA).toEqual({ cash: "cash", "credit-card": "card", "debit-card": "card" });
  });

  it("el descuento global de Alegra sale como discountAmount", () => {
    expect(proformaDesdeAlegra(factura({ discount: 50 }), NEGOCIO).discountAmount).toBe(50);
  });

  it("cliente sin nombre → «Cliente sin nombre», nunca una cadena vacía", () => {
    expect(proformaDesdeAlegra(factura({ clientName: "" }), NEGOCIO).customerName).toBe("Cliente sin nombre");
  });

  it("customerId y customerDocument son undefined (no null) cuando la factura no los trae", () => {
    const p = proformaDesdeAlegra(factura({ clientId: null, clientDocument: null }), NEGOCIO);
    expect(p.customerId).toBeUndefined();
    expect(p.customerDocument).toBeUndefined();
  });

  it("createdAt usa issuedAt, o date si no hay fecha de emisión; updatedAt es la misma", () => {
    const p1 = proformaDesdeAlegra(
      factura({ issuedAt: "2026-09-01T10:00:00Z", date: "2026-09-01" }),
      NEGOCIO,
    );
    expect(p1.createdAt).toBe("2026-09-01T10:00:00Z");
    expect(p1.updatedAt).toBe(p1.createdAt);

    const p2 = proformaDesdeAlegra(factura({ issuedAt: null, date: "2026-08-15" }), NEGOCIO);
    expect(p2.createdAt).toBe("2026-08-15");
  });

  it("businessId es el del segundo parámetro; branchId el de la factura (o \"\" si falta)", () => {
    const p = proformaDesdeAlegra(factura({ branchId: "suc-9" }), "biz-42");
    expect(p.businessId).toBe("biz-42");
    expect(p.branchId).toBe("suc-9");
    expect(proformaDesdeAlegra(factura({ branchId: null }), NEGOCIO).branchId).toBe("");
  });

  it("cada línea trae el nombre y el productId de Alegra, o \"\" si no viene producto vinculado", () => {
    const p = proformaDesdeAlegra(
      factura({ lineas: [linea({ productId: null, name: "Crema X" })] }),
      NEGOCIO,
    );
    expect(p.items[0]?.productName).toBe("Crema X");
    expect(p.items[0]?.productId).toBe("");
  });

  it("itbisRate se deriva de itbis/(total-itbis), redondeado a 2 decimales", () => {
    const p = proformaDesdeAlegra(
      factura({ lineas: [linea({ itbis: 18, total: 118 })] }),
      NEGOCIO,
    );
    expect(p.items[0]?.itbisRate).toBeCloseTo(0.18, 2);
  });

  it("itbisRate cae a 0.18 cuando la base gravable no se puede derivar", () => {
    const p = proformaDesdeAlegra(
      factura({ lineas: [linea({ itbis: 0, total: 0 })] }),
      NEGOCIO,
    );
    expect(p.items[0]?.itbisRate).toBe(0.18);
  });
});
