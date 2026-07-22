import { describe, it, expect } from "vitest";
import {
  normalizeDocument,
  normalizePhone,
  normalizeEmail,
  saleBelongsToCustomer,
  purchasesForCustomer,
  computeCustomerPurchaseStats,
  collectConvertedSourceIds,
  isFinalCustomerTransaction,
  purchasesByMonth,
} from "./customer-purchases";
import type { Proforma } from "@/types";

const customer = {
  id: "cust_willian",
  documentNumber: "031-0327428-2",
  phone: "829-714-1975",
};

function sale(overrides: Partial<Proforma>): Proforma {
  return {
    id: "p1",
    businessId: "b",
    branchId: "br",
    number: "B0200001247",
    customerName: "WILLIAN R RODRIGUEZ",
    cashierId: "u",
    cashierName: "Rosa",
    items: [{} as never],
    subtotal: 100,
    discount: 0,
    itbis: 18,
    total: 118,
    paid: 118,
    balance: 0,
    status: "paid",
    documentKind: "invoice",
    createdAt: "2026-07-03T10:00:00Z",
    updatedAt: "2026-07-03T10:00:00Z",
    ...overrides,
  } as Proforma;
}

describe("normalizadores", () => {
  it("documento: 031-0327428-2 == 03103274282", () => {
    expect(normalizeDocument("031-0327428-2")).toBe("03103274282");
    expect(normalizeDocument("03103274282")).toBe("03103274282");
  });
  it("teléfono: 829-714-1975 == +1 829 714 1975 == (829)7141975", () => {
    expect(normalizePhone("829-714-1975")).toBe("8297141975");
    expect(normalizePhone("+1 829 714 1975")).toBe("8297141975");
    expect(normalizePhone("(829)7141975")).toBe("8297141975");
  });
  it("email: lowercase + trim", () => {
    expect(normalizeEmail("  WRodriguez3030@Gmail.com ")).toBe(
      "wrodriguez3030@gmail.com",
    );
  });
});

describe("saleBelongsToCustomer", () => {
  it("relación principal: customer_id", () => {
    expect(
      saleBelongsToCustomer(sale({ customerId: "cust_willian" }), customer),
    ).toBe(true);
    expect(
      saleBelongsToCustomer(sale({ customerId: "otro" }), customer),
    ).toBe(false);
  });

  it("fallback por documento cuando la venta no tiene customer_id", () => {
    expect(
      saleBelongsToCustomer(
        sale({ customerId: undefined, customerDocument: "03103274282" }),
        customer,
      ),
    ).toBe(true);
  });

  it("fallback por teléfono normalizado", () => {
    expect(
      saleBelongsToCustomer(
        sale({ customerId: undefined, customerPhone: "+1 8297141975" }),
        customer,
      ),
    ).toBe(true);
  });

  it("walk-in sin datos NO se mezcla con cliente real", () => {
    expect(
      saleBelongsToCustomer(
        sale({
          customerId: undefined,
          customerName: "Walk-in / Consumidor final",
          customerDocument: undefined,
          customerPhone: undefined,
        }),
        customer,
      ),
    ).toBe(false);
  });

  it("venta con customer_id de OTRO cliente no cae al fallback", () => {
    expect(
      saleBelongsToCustomer(
        sale({ customerId: "otro", customerDocument: "03103274282" }),
        customer,
      ),
    ).toBe(false);
  });
});

describe("computeCustomerPurchaseStats", () => {
  it("suma facturas pagadas, cuenta compras y usa la última venta como visita", () => {
    const purchases = purchasesForCustomer(
      [
        sale({ id: "a", customerId: "cust_willian", total: 2268, createdAt: "2026-07-03T10:00:00Z" }),
        sale({ id: "b", customerId: "cust_willian", total: 3240, createdAt: "2026-07-03T12:00:00Z" }),
        sale({ id: "c", customerId: "otro", total: 999 }),
      ],
      customer,
    );
    const s = computeCustomerPurchaseStats(purchases);
    expect(s.totalSpent).toBe(5508);
    expect(s.purchases).toBe(2);
    expect(s.lastVisitAt).toBe("2026-07-03T12:00:00Z");
  });

  it("facturas anuladas y borradores NO cuentan", () => {
    const s = computeCustomerPurchaseStats([
      sale({ id: "a", status: "cancelled", total: 1000 }),
      sale({ id: "b", status: "draft", documentKind: "proforma", total: 500 }),
    ]);
    expect(s.totalSpent).toBe(0);
    expect(s.purchases).toBe(0);
    expect(s.lastVisitAt).toBeNull();
  });

  it("proformas pendientes se reportan aparte sin sumar al total", () => {
    const s = computeCustomerPurchaseStats([
      sale({ id: "a", status: "issued", documentKind: "proforma", total: 700 }),
      sale({ id: "b", status: "paid", total: 118 }),
    ]);
    expect(s.pendingProformas).toBe(1);
    expect(s.totalSpent).toBe(118);
    expect(s.purchases).toBe(1);
  });

  it("pago parcial suma lo pagado", () => {
    const s = computeCustomerPurchaseStats([
      sale({ id: "a", status: "partially_paid", total: 1000, paid: 400 }),
    ]);
    expect(s.totalSpent).toBe(400);
    expect(s.purchases).toBe(1);
  });

  it("ticket promedio = total / compras", () => {
    const s = computeCustomerPurchaseStats([
      sale({ id: "a", total: 100 }),
      sale({ id: "b", total: 300 }),
    ]);
    expect(s.avgTicket).toBe(200);
  });

  it("voided NO cuenta (estado extendido de la DB)", () => {
    const s = computeCustomerPurchaseStats([
      sale({ id: "a", status: "voided" as never, total: 900 }),
    ]);
    expect(s.totalSpent).toBe(0);
    expect(s.purchases).toBe(0);
  });
});

describe("proforma convertida en factura — anti doble conteo", () => {
  it("la proforma origen NO suma cuando otra factura la referencia", () => {
    const prof = sale({
      id: "prof_1",
      number: "PROF-2026-89236",
      documentKind: "proforma",
      status: "paid",
      total: 5000,
    });
    const invoice = sale({
      id: "inv_1",
      number: "B0200001301",
      documentKind: "invoice",
      status: "paid",
      total: 5000,
      sourceProformaId: "prof_1",
    });
    const s = computeCustomerPurchaseStats([prof, invoice]);
    // Una sola compra (el documento final), no dos.
    expect(s.purchases).toBe(1);
    expect(s.totalSpent).toBe(5000);
  });

  it("collectConvertedSourceIds ignora facturas anuladas", () => {
    const ids = collectConvertedSourceIds([
      sale({ id: "inv_x", status: "cancelled", sourceProformaId: "prof_9" }),
    ]);
    expect(ids.size).toBe(0);
  });

  it("isFinalCustomerTransaction: reglas centrales", () => {
    const converted = new Set(["prof_1"]);
    expect(isFinalCustomerTransaction(sale({ id: "prof_1" }), converted)).toBe(false);
    expect(isFinalCustomerTransaction(sale({ id: "x", status: "cancelled" }))).toBe(false);
    expect(isFinalCustomerTransaction(sale({ id: "x", status: "paid" }))).toBe(true);
    expect(
      isFinalCustomerTransaction(
        sale({ id: "x", status: "issued", documentKind: "proforma" }),
      ),
    ).toBe(false);
  });

  it("proforma convertida sigue visible para última visita", () => {
    const s = computeCustomerPurchaseStats([
      sale({
        id: "prof_1",
        documentKind: "proforma",
        status: "paid",
        total: 100,
        createdAt: "2026-07-05T10:00:00Z",
      }),
      sale({
        id: "inv_1",
        documentKind: "invoice",
        status: "paid",
        total: 100,
        sourceProformaId: "prof_1",
        createdAt: "2026-07-01T10:00:00Z",
      }),
    ]);
    // La visita más reciente es la proforma (aunque no sume dos veces).
    expect(s.lastVisitAt).toBe("2026-07-05T10:00:00Z");
    expect(s.purchases).toBe(1);
  });
});

describe("purchasesByMonth (gráfica del perfil)", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("agrupa el gasto por mes y cuadra con las compras finales", () => {
    const data = purchasesByMonth(
      [
        sale({ id: "a", total: 1000, paid: 1000, createdAt: "2026-07-04T10:00:00Z" }),
        sale({ id: "b", total: 500, paid: 500, createdAt: "2026-07-20T10:00:00Z" }),
        sale({ id: "c", total: 300, paid: 300, createdAt: "2026-06-10T10:00:00Z" }),
        // Anulada → NO cuenta.
        sale({ id: "d", total: 999, status: "cancelled", createdAt: "2026-07-01T10:00:00Z" }),
      ],
      6,
      now,
    );
    expect(data).toHaveLength(6);
    // Último bucket = julio (mes de `now`).
    const jul = data[data.length - 1]!;
    expect(jul.label).toBe("jul");
    expect(jul.value).toBe(1500); // 1000 + 500 (la anulada no suma)
    const jun = data[data.length - 2]!;
    expect(jun.label).toBe("jun");
    expect(jun.value).toBe(300);
  });

  it("meses sin compras quedan en 0", () => {
    const data = purchasesByMonth([], 6, now);
    expect(data.every((m) => m.value === 0)).toBe(true);
  });
});

describe("normalizeDocument con pasaportes (letras)", () => {
  it("no confunde dos pasaportes distintos con los mismos dígitos", () => {
    expect(normalizeDocument("AB-123456")).not.toBe(normalizeDocument("CD-123456"));
    expect(normalizeDocument("ab123456")).toBe("AB123456");
  });
});
