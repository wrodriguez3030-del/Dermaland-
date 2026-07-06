import { describe, it, expect } from "vitest";
import type { Customer, Proforma } from "@/types";
import {
  computeCustomersReport,
  computeCustomersReportKpis,
  filterSalesForPeriod,
  isVipCustomer,
} from "./customer-metrics";
import {
  purchasesForCustomer,
  computeCustomerPurchaseStats,
  collectConvertedSourceIds,
} from "./customer-purchases";

/**
 * Regla de oro del módulo: el Reporte de Clientes usa la MISMA capa de
 * métricas que el perfil. Estos tests verifican esa paridad con el caso de
 * regresión real: WILLIAN R RODRIGUEZ (perfil 16 compras / RD$34,908 vs
 * reporte 0 / RD$0.00).
 */

function customer(overrides: Partial<Customer>): Customer {
  return {
    id: "cust_1",
    businessId: "b",
    customerNumber: "CLI-420678",
    firstName: "WILLIAN R",
    lastName: "RODRIGUEZ",
    documentNumber: "031-0327428-2",
    phone: "829-714-1975",
    source: "manual",
    tags: [],
    defaultBillingType: "consumo",
    skinType: "normal",
    totalSpent: 0, // columna estática vieja — NO debe usarse
    totalOrders: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    consents: [],
    ...overrides,
  } as Customer;
}

function sale(overrides: Partial<Proforma>): Proforma {
  return {
    id: `p_${Math.random().toString(36).slice(2, 8)}`,
    businessId: "b",
    branchId: "br_1",
    number: "B0200001247",
    customerName: "WILLIAN R RODRIGUEZ",
    cashierId: "u",
    cashierName: "Rosa",
    items: [],
    subtotal: 100,
    discount: 0,
    itbis: 18,
    total: 118,
    paid: 118,
    balance: 0,
    status: "paid",
    documentKind: "invoice",
    payments: [],
    createdAt: "2026-07-03T10:00:00Z",
    updatedAt: "2026-07-03T10:00:00Z",
    ...overrides,
  } as Proforma;
}

describe("paridad perfil ↔ reporte (caso WILLIAN CLI-420678)", () => {
  // 16 compras reales de RD$2,181.75 = RD$34,908.00
  const willian = customer({ id: "cust_willian" });
  const sales: Proforma[] = Array.from({ length: 16 }, (_, i) =>
    sale({
      id: `venta_${i}`,
      customerId: "cust_willian",
      total: 2181.75,
      createdAt: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
    }),
  );

  it("el reporte da EXACTAMENTE los mismos números que el perfil", () => {
    // Perfil:
    const profilePurchases = purchasesForCustomer(sales, willian);
    const profileStats = computeCustomerPurchaseStats(
      profilePurchases,
      collectConvertedSourceIds(profilePurchases),
    );
    // Reporte (misma capa):
    const rows = computeCustomersReport([willian], sales);
    const reportStats = rows[0]!.stats;

    expect(reportStats.totalSpent).toBe(profileStats.totalSpent);
    expect(reportStats.purchases).toBe(profileStats.purchases);
    expect(reportStats.lastVisitAt).toBe(profileStats.lastVisitAt);
    expect(reportStats.avgTicket).toBe(profileStats.avgTicket);
    // Y los valores reales del caso:
    expect(reportStats.purchases).toBe(16);
    expect(reportStats.totalSpent).toBeCloseTo(34908, 2);
  });

  it("NUNCA usa la columna estática totalSpent/totalOrders del cliente", () => {
    // Cliente con columnas estáticas mintiendo (99999 / 99):
    const stale = customer({
      id: "cust_willian",
      totalSpent: 99999,
      totalOrders: 99,
    });
    const rows = computeCustomersReport([stale], sales);
    expect(rows[0]!.stats.totalSpent).toBeCloseTo(34908, 2);
    expect(rows[0]!.stats.purchases).toBe(16);
  });
});

describe("computeCustomersReport — emparejamiento", () => {
  it("ventas legacy sin customerId se asignan por documento normalizado", () => {
    const c = customer({ id: "c1" });
    const rows = computeCustomersReport(
      [c],
      [sale({ customerId: undefined, customerDocument: "03103274282", total: 500 })],
    );
    expect(rows[0]!.stats.totalSpent).toBe(500);
  });

  it("documento ambiguo (2 clientes) NO se asigna a ninguno", () => {
    const c1 = customer({ id: "c1" });
    const c2 = customer({ id: "c2", customerNumber: "CLI-000002" });
    const rows = computeCustomersReport(
      [c1, c2],
      [sale({ customerId: undefined, customerDocument: "031-0327428-2" })],
    );
    expect(rows[0]!.stats.purchases).toBe(0);
    expect(rows[1]!.stats.purchases).toBe(0);
  });

  it("walk-in sin datos no se asigna a nadie", () => {
    const c = customer({ id: "c1" });
    const rows = computeCustomersReport(
      [c],
      [
        sale({
          customerId: undefined,
          customerName: "Walk-in / Consumidor final",
          customerDocument: undefined,
          customerPhone: undefined,
        }),
      ],
    );
    expect(rows[0]!.stats.purchases).toBe(0);
  });

  it("venta huérfana (customerId inexistente) no se asigna por fallback", () => {
    const c = customer({ id: "c1" });
    const rows = computeCustomersReport(
      [c],
      [sale({ customerId: "cliente_borrado", customerDocument: "031-0327428-2" })],
    );
    expect(rows[0]!.stats.purchases).toBe(0);
  });

  it("proforma convertida no duplica en el agregado", () => {
    const c = customer({ id: "c1" });
    const rows = computeCustomersReport(
      [c],
      [
        sale({
          id: "prof_1",
          customerId: "c1",
          documentKind: "proforma",
          status: "paid",
          total: 5000,
        }),
        sale({
          id: "inv_1",
          customerId: "c1",
          documentKind: "invoice",
          status: "paid",
          total: 5000,
          sourceProformaId: "prof_1",
        }),
      ],
    );
    expect(rows[0]!.stats.purchases).toBe(1);
    expect(rows[0]!.stats.totalSpent).toBe(5000);
  });
});

describe("filterSalesForPeriod — filtros de fecha y sucursal", () => {
  const sales = [
    sale({ id: "a", branchId: "br_1", createdAt: "2026-06-15T10:00:00Z" }),
    sale({ id: "b", branchId: "br_2", createdAt: "2026-07-01T10:00:00Z" }),
  ];

  it("filtra por sucursal", () => {
    const out = filterSalesForPeriod(sales, { branchId: "br_1" });
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });

  it("filtra por rango de fechas (to inclusivo fin de día)", () => {
    const out = filterSalesForPeriod(sales, { from: "2026-07-01", to: "2026-07-01" });
    expect(out.map((s) => s.id)).toEqual(["b"]);
  });

  it("sin filtro devuelve todo", () => {
    expect(filterSalesForPeriod(sales, undefined)).toHaveLength(2);
  });
});

describe("KPIs y VIP", () => {
  it("KPIs del reporte salen de las mismas filas (activos, total, ticket, VIP)", () => {
    const c1 = customer({ id: "c1", tags: ["VIP"] });
    const c2 = customer({ id: "c2", customerNumber: "CLI-2" });
    const rows = computeCustomersReport(
      [c1, c2],
      [
        sale({ customerId: "c1", total: 1000 }),
        sale({ customerId: "c1", total: 3000 }),
      ],
    );
    const k = computeCustomersReportKpis(rows);
    expect(k.totalCustomers).toBe(2);
    expect(k.activeCustomers).toBe(1);
    expect(k.totalSpent).toBe(4000);
    expect(k.totalPurchases).toBe(2);
    expect(k.avgTicket).toBe(2000);
    expect(k.vipCustomers).toBe(1);
  });

  it("isVipCustomer: regla central por etiqueta (umbral configurable)", () => {
    expect(isVipCustomer({ tags: ["VIP"] })).toBe(true);
    expect(isVipCustomer({ tags: [] })).toBe(false);
    expect(
      isVipCustomer({ tags: [] }, { totalSpent: 99999, purchases: 50 }, {
        tag: "VIP",
        minSpent: 50000,
        minPurchases: null,
      }),
    ).toBe(true);
  });
});
