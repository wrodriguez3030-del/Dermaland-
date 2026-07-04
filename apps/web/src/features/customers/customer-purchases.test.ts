import { describe, it, expect } from "vitest";
import {
  normalizeDocument,
  normalizePhone,
  normalizeEmail,
  saleBelongsToCustomer,
  purchasesForCustomer,
  computeCustomerPurchaseStats,
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
});
