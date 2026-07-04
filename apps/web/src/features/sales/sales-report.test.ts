import { describe, it, expect } from "vitest";
import type { Proforma, SaleItem, Payment, ProformaStatus } from "@/types";
import {
  buildSalesReport,
  byPaymentMethod,
  comprobanteKey,
  computeSalesKpis,
  filterSales,
  quickRange,
  saleMethodSummary,
  toSalesTableRow,
  EMPTY_FILTERS,
} from "./sales-report";

// ─── Factory de fixtures ─────────────────────────────────────────────────────

let seq = 0;
function item(partial: Partial<SaleItem> = {}): SaleItem {
  const quantity = partial.quantity ?? 1;
  const unitPrice = partial.unitPrice ?? 100;
  const subtotal = partial.subtotal ?? unitPrice * quantity;
  const itbis = partial.itbis ?? subtotal * 0.18;
  return {
    productId: partial.productId ?? "prod-1",
    productSku: partial.productSku ?? "SKU-1",
    productName: partial.productName ?? "Crema",
    quantity,
    unitPrice,
    itbisRate: 0.18,
    discount: partial.discount ?? 0,
    subtotal,
    itbis,
    total: partial.total ?? subtotal + itbis,
  };
}

function pay(method: Payment["method"], amount: number): Payment {
  return {
    id: `pay-${seq++}`,
    proformaId: "x",
    method,
    amount,
    userId: "u1",
    userName: "Cajero 1",
    createdAt: "2026-06-15T10:00:00",
  };
}

function makeSale(partial: Partial<Proforma> = {}): Proforma {
  const items = partial.items ?? [item()];
  const subtotal = partial.subtotal ?? items.reduce((s, i) => s + i.subtotal, 0);
  const itbis = partial.itbis ?? items.reduce((s, i) => s + i.itbis, 0);
  const total = partial.total ?? subtotal + itbis;
  return {
    id: partial.id ?? `sale-${seq++}`,
    number: partial.number ?? "B0200000001",
    customerId: partial.customerId,
    customerName: partial.customerName ?? "Consumidor final",
    cashierId: partial.cashierId ?? "c1",
    cashierName: partial.cashierName ?? "Rosa",
    items,
    subtotal,
    discount: partial.discount ?? 0,
    itbis,
    total,
    status: partial.status ?? ("paid" as ProformaStatus),
    payments: partial.payments ?? [pay("cash", total)],
    paid: partial.paid ?? total,
    balance: partial.balance ?? 0,
    businessId: "biz-1",
    branchId: partial.branchId ?? "branch-1",
    createdAt: partial.createdAt ?? "2026-06-15T10:00:00",
    updatedAt: partial.updatedAt ?? "2026-06-15T10:00:00",
    documentKind: partial.documentKind ?? "invoice",
    ecfNumber: partial.ecfNumber,
    ecfType: partial.ecfType,
    customerPhone: partial.customerPhone,
    customerDocument: partial.customerDocument,
    discountAmount: partial.discountAmount,
    sellerId: partial.sellerId,
    sellerName: partial.sellerName,
  };
}

const branchNames = new Map([
  ["branch-1", "DermaLand Principal"],
  ["branch-2", "DermaLand Cutis"],
]);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("filterSales", () => {
  it("1. filtra por rango de fechas (inclusivo)", () => {
    const all = [
      makeSale({ createdAt: "2026-06-10T09:00:00" }),
      makeSale({ createdAt: "2026-06-15T09:00:00" }),
      makeSale({ createdAt: "2026-06-20T09:00:00" }),
    ];
    const out = filterSales(all, { from: "2026-06-15", to: "2026-06-20" });
    expect(out).toHaveLength(2);
  });

  it("2. filtra por sucursal", () => {
    const all = [
      makeSale({ branchId: "branch-1" }),
      makeSale({ branchId: "branch-2" }),
    ];
    expect(filterSales(all, { branchId: "branch-2" })).toHaveLength(1);
  });

  it("3. filtra por método de pago usando pagos reales", () => {
    const all = [
      makeSale({ payments: [pay("cash", 118)] }),
      makeSale({ payments: [pay("card", 118)] }),
      makeSale({ payments: [pay("cash", 50), pay("card", 68)] }), // mixto
    ];
    expect(filterSales(all, { method: "cash" })).toHaveLength(1);
    expect(filterSales(all, { method: "mixed" })).toHaveLength(1);
  });

  it("4. filtra por tipo de comprobante", () => {
    const all = [
      makeSale({ number: "B0200000001", documentKind: "invoice" }),
      makeSale({ number: "B0100000001", documentKind: "invoice", ecfNumber: "B0100000001" }),
      makeSale({ documentKind: "invoice", ecfType: "32", ecfNumber: "E320000001" }),
    ];
    expect(filterSales(all, { comprobante: "b01" })).toHaveLength(1);
    expect(filterSales(all, { comprobante: "e32" })).toHaveLength(1);
  });

  it("5. filtra por cajero", () => {
    const all = [
      makeSale({ cashierId: "c1" }),
      makeSale({ cashierId: "c2" }),
    ];
    expect(filterSales(all, { cashierId: "c1" })).toHaveLength(1);
  });

  it("6. filtra por cliente (nombre, teléfono o documento)", () => {
    const all = [
      makeSale({ customerName: "WILLIAN RODRIGUEZ", customerPhone: "809-555-1212" }),
      makeSale({ customerName: "Otro Cliente", customerDocument: "00112345678" }),
    ];
    expect(filterSales(all, { customerQuery: "willian" })).toHaveLength(1);
    expect(filterSales(all, { customerQuery: "555-1212" })).toHaveLength(1);
    expect(filterSales(all, { customerQuery: "0011234" })).toHaveLength(1);
  });

  it("15. las proformas no se mezclan con facturas (excluidas por defecto)", () => {
    const all = [
      makeSale({ documentKind: "invoice" }),
      makeSale({ documentKind: "proforma" }),
    ];
    expect(filterSales(all, EMPTY_FILTERS)).toHaveLength(1); // solo factura
    expect(filterSales(all, { includeProformas: true })).toHaveLength(2);
    // y filtrando explícitamente proforma solo trae la proforma
    expect(filterSales(all, { comprobante: "proforma" })).toHaveLength(1);
    expect(comprobanteKey(all[1]!)).toBe("proforma");
  });
});

describe("computeSalesKpis", () => {
  it("7. total facturado suma los totales (excluye anuladas)", () => {
    const all = [
      makeSale({ total: 118 }),
      makeSale({ total: 236 }),
      makeSale({ total: 100, status: "cancelled" }),
    ];
    const k = computeSalesKpis(all);
    expect(k.totalBilled).toBe(354);
    expect(k.refunds).toBe(100);
    expect(k.net).toBe(254);
  });

  it("8. ITBIS suma el itbis de las ventas", () => {
    const all = [
      makeSale({ itbis: 18, total: 118 }),
      makeSale({ itbis: 36, total: 236 }),
    ];
    expect(computeSalesKpis(all).itbis).toBe(54);
  });

  it("9. ticket promedio = total facturado / transacciones", () => {
    const all = [makeSale({ total: 100 }), makeSale({ total: 300 })];
    const k = computeSalesKpis(all);
    expect(k.transactions).toBe(2);
    expect(k.avgTicket).toBe(200);
  });

  it("ticket promedio es 0 sin transacciones", () => {
    expect(computeSalesKpis([]).avgTicket).toBe(0);
  });

  it("margen estimado se calcula solo si hay costo", () => {
    const sale = makeSale({
      items: [item({ productId: "p1", quantity: 2, subtotal: 200, itbis: 36, total: 236 })],
      subtotal: 200,
      itbis: 36,
      total: 236,
    });
    expect(computeSalesKpis([sale]).marginEstimate).toBeNull();
    const cost = new Map([["p1", 40]]);
    expect(computeSalesKpis([sale], cost).marginEstimate).toBe(120); // 200 - 40*2
  });
});

describe("byPaymentMethod", () => {
  it("10. usa los pagos reales (no el total de la venta)", () => {
    const all = [
      makeSale({ total: 118, payments: [pay("cash", 118)] }),
      makeSale({ total: 200, payments: [pay("card", 120), pay("transfer", 80)] }),
      makeSale({ total: 50, status: "cancelled", payments: [pay("cash", 50)] }),
    ];
    const rows = byPaymentMethod(all);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.amount]));
    expect(byKey.cash).toBe(118); // la anulada no cuenta
    expect(byKey.card).toBe(120);
    expect(byKey.transfer).toBe(80);
  });

  it("saleMethodSummary marca mixto con dos grupos", () => {
    expect(saleMethodSummary({ payments: [pay("cash", 10), pay("card", 5)] })).toBe("mixed");
    expect(saleMethodSummary({ payments: [pay("azul", 10)] })).toBe("card");
    expect(saleMethodSummary({ payments: [] })).toBe("none");
  });
});

describe("buildSalesReport / tabla", () => {
  it("11. la tabla muestra las ventas filtradas", () => {
    const all = [makeSale({ branchId: "branch-1" }), makeSale({ branchId: "branch-2" })];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]!.branchName).toMatch(/DermaLand/);
  });

  it("16. la fila de tabla NO expone UUIDs/ids internos en sus campos legibles", () => {
    const sale = makeSale({
      id: "550e8400-e29b-41d4-a716-446655440000",
      branchId: "branch-1",
      number: "B0200000099",
    });
    const row = toSalesTableRow(sale, branchNames);
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    // El comprobante y la sucursal son legibles, sin ids.
    expect(row.comprobante).toBe("B0200000099");
    expect(row.branchName).toBe("DermaLand Principal");
    // Ningún campo visible contiene branch_id ni el uuid del documento.
    const visible = [
      row.dateTime,
      row.branchName,
      row.comprobante,
      row.documentType,
      row.customer,
      row.cashier,
      row.methodLabel,
      row.statusLabel,
    ].join(" | ");
    expect(uuid.test(visible)).toBe(false);
    expect(visible).not.toContain("branch-1");
    expect(visible).not.toContain("biz-1");
  });
});

describe("quickRange", () => {
  it("calcula hoy/ayer/todo", () => {
    const now = new Date("2026-06-15T12:00:00");
    expect(quickRange("today", now)).toEqual({ from: "2026-06-15", to: "2026-06-15" });
    expect(quickRange("yesterday", now)).toEqual({ from: "2026-06-14", to: "2026-06-14" });
    expect(quickRange("all", now)).toEqual({ from: "", to: "" });
    expect(quickRange("thisMonth", now).from).toBe("2026-06-01");
  });
});

describe("bySeller — ventas por vendedor (incentivos)", () => {
  it("agrupa por vendedor, cuenta transacciones y suma total", () => {
    const all = [
      makeSale({ sellerId: "s1", sellerName: "Ana", total: 1000 }),
      makeSale({ sellerId: "s1", sellerName: "Ana", total: 500 }),
      makeSale({ sellerId: "s2", sellerName: "Beto", total: 2000 }),
    ];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    const ana = report.sellers.find((s) => s.id === "s1");
    const beto = report.sellers.find((s) => s.id === "s2");
    expect(ana).toMatchObject({ name: "Ana", transactions: 2, total: 1500 });
    expect(beto).toMatchObject({ name: "Beto", transactions: 1, total: 2000 });
    // ordenado por total desc
    expect(report.sellers[0]!.id).toBe("s2");
  });

  it("ventas sin vendedor caen en 'No asignado'", () => {
    const all = [makeSale({ sellerId: undefined, total: 300 })];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    expect(report.sellers[0]).toMatchObject({
      name: "No asignado",
      transactions: 1,
      total: 300,
    });
  });

  it("ventas anuladas no cuentan para el vendedor", () => {
    const all = [
      makeSale({ sellerId: "s1", sellerName: "Ana", total: 1000, status: "cancelled" as ProformaStatus }),
      makeSale({ sellerId: "s1", sellerName: "Ana", total: 500 }),
    ];
    const report = buildSalesReport(all, EMPTY_FILTERS, { branchNames });
    expect(report.sellers.find((s) => s.id === "s1")).toMatchObject({
      transactions: 1,
      total: 500,
    });
  });

  it("filterSales filtra por sellerId", () => {
    const all = [
      makeSale({ sellerId: "s1", sellerName: "Ana" }),
      makeSale({ sellerId: "s2", sellerName: "Beto" }),
    ];
    expect(filterSales(all, { sellerId: "s1" })).toHaveLength(1);
    expect(filterSales(all, { sellerId: "s1" })[0]!.sellerId).toBe("s1");
  });

  it("filterSales con sellerId='__none__' devuelve solo sin vendedor", () => {
    const all = [
      makeSale({ sellerId: "s1", sellerName: "Ana" }),
      makeSale({ sellerId: undefined }),
    ];
    const out = filterSales(all, { sellerId: "__none__" });
    expect(out).toHaveLength(1);
    expect(out[0]!.sellerId).toBeUndefined();
  });
});
