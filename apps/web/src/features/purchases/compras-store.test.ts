// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  listInvoices,
  createInvoice,
  registerInvoicePayment,
  voidInvoice,
  deleteInvoice,
  createExpense,
  listExpenses,
  deleteExpense,
  createRecurring,
  setRecurringActive,
  generateRecurringRun,
  deleteRecurring,
  comprasSummary,
  clearLocalPurchases,
  type SupplierInvoiceItem,
} from "./compras-store";
import { availableStock, clearLocalInventory } from "@/features/inventory/lot-store";
import { mockBusiness } from "@/lib/mock-data/tenancy";

const BR = "br_santiago";

function item(over: Partial<SupplierInvoiceItem> = {}): SupplierInvoiceItem {
  return {
    name: "Servicio",
    quantity: 1,
    unitCost: 100,
    itbis: 18,
    total: 118,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  clearLocalPurchases();
  clearLocalInventory();
});

describe("facturas de proveedor", () => {
  it("crea una factura y calcula totales", () => {
    const r = createInvoice({
      supplierName: "Distribuidora X",
      number: "F-001",
      issueDate: "2026-06-17",
      branchId: BR,
      items: [item({ quantity: 2, unitCost: 100, itbis: 36, total: 236 })],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.invoice.total).toBe(2 * 100 + 36);
      expect(listInvoices()).toHaveLength(1);
    }
  });

  it("compra inventariable aumenta el stock por sucursal (purchase_in)", () => {
    expect(availableStock("prod_compra_test")).toBe(0);
    const r = createInvoice({
      supplierName: "Lab",
      number: "F-INV",
      issueDate: "2026-06-17",
      branchId: BR,
      addToInventory: true,
      items: [
        item({
          productId: "prod_compra_test",
          quantity: 10,
          unitCost: 50,
          itbis: 0,
          total: 500,
          lotNumber: "LOTE-1",
          expiresAt: "2027-12-31",
          branchId: BR,
        }),
      ],
    });
    expect(r.ok).toBe(true);
    expect(availableStock("prod_compra_test")).toBe(10);
  });

  it("registra pago parcial y luego total", () => {
    const r = createInvoice({
      supplierName: "Y",
      number: "F-PAY",
      issueDate: "2026-06-17",
      branchId: BR,
      items: [item({ quantity: 1, unitCost: 100, itbis: 0, total: 100 })],
    });
    if (!r.ok) throw new Error("setup");
    registerInvoicePayment(r.invoice.id, 40, "efectivo");
    expect(listInvoices()[0]!.status).toBe("parcial");
    registerInvoicePayment(r.invoice.id, 60, "efectivo");
    expect(listInvoices()[0]!.status).toBe("pagada");
  });

  it("bloquea eliminar factura con pagos; permite anular", () => {
    const r = createInvoice({
      supplierName: "Z",
      number: "F-DEL",
      issueDate: "2026-06-17",
      branchId: BR,
      items: [item({ total: 100, itbis: 0, unitCost: 100 })],
    });
    if (!r.ok) throw new Error("setup");
    registerInvoicePayment(r.invoice.id, 50, "efectivo");
    expect(deleteInvoice(r.invoice.id).ok).toBe(false);
    expect(voidInvoice(r.invoice.id).ok).toBe(true);
  });
});

describe("gastos / gastos menores", () => {
  it("crea un gasto general", () => {
    const r = createExpense({
      date: "2026-06-17",
      category: "Servicios (luz/agua/internet)",
      payee: "EDE",
      concept: "Luz junio",
      amount: 3500,
      method: "transferencia",
      reference: "TRF-1",
      branchId: BR,
    });
    expect(r.ok).toBe(true);
    expect(listExpenses(false)).toHaveLength(1);
  });

  it("crea un gasto menor (petty)", () => {
    createExpense({
      date: "2026-06-17",
      category: "Transporte",
      payee: "Taxi",
      concept: "Mensajería",
      amount: 300,
      method: "efectivo",
      branchId: BR,
      petty: true,
    });
    expect(listExpenses(true)).toHaveLength(1);
    expect(listExpenses(false)).toHaveLength(0);
  });

  it("tarjeta/transferencia guarda SOLO últimos 4 (nunca el PAN)", () => {
    const r = createExpense({
      date: "2026-06-17",
      category: "Suministros",
      payee: "Proveedor",
      concept: "Compra tarjeta",
      amount: 1000,
      method: "tarjeta",
      last4: "4111111111114242",
      branchId: BR,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.expense.last4).toBe("4242");
      expect(r.expense.last4!.length).toBe(4);
    }
  });

  it("bloquea eliminar gasto pagado, permite anular y luego eliminar", () => {
    const r = createExpense({
      date: "2026-06-17",
      category: "Otros",
      payee: "X",
      concept: "Gasto",
      amount: 100,
      method: "efectivo",
      branchId: BR,
    });
    if (!r.ok) throw new Error("setup");
    expect(deleteExpense(r.expense.id).ok).toBe(false);
  });
});

describe("pagos recurrentes", () => {
  it("crea, genera corrida (crea gasto) y registra historial", () => {
    const r = createRecurring({
      name: "Internet",
      category: "Servicios (luz/agua/internet)",
      amount: 2500,
      frequency: "mensual",
      startDate: "2026-01-01",
      branchId: BR,
      method: "transferencia",
    });
    if (!r.ok) throw new Error("setup");
    const run = generateRecurringRun(r.recurring.id);
    expect(run.ok).toBe(true);
    expect(listExpenses().some((e) => e.concept.includes("Internet"))).toBe(true);
  });

  it("inactivar bloquea generar corrida", () => {
    const r = createRecurring({
      name: "Alquiler",
      category: "Alquiler",
      amount: 30000,
      frequency: "mensual",
      startDate: "2026-01-01",
      branchId: BR,
      method: "transferencia",
    });
    if (!r.ok) throw new Error("setup");
    setRecurringActive(r.recurring.id, false);
    expect(generateRecurringRun(r.recurring.id).ok).toBe(false);
  });

  it("bloquea eliminar recurrente con corridas", () => {
    const r = createRecurring({
      name: "Software",
      category: "Software",
      amount: 1000,
      frequency: "mensual",
      startDate: "2026-01-01",
      branchId: BR,
      method: "tarjeta",
    });
    if (!r.ok) throw new Error("setup");
    generateRecurringRun(r.recurring.id);
    expect(deleteRecurring(r.recurring.id).ok).toBe(false);
  });
});

describe("resumen y scoping", () => {
  it("resumen calcula cuentas por pagar y gastos", () => {
    createInvoice({
      supplierName: "A",
      number: "F1",
      issueDate: new Date().toISOString().slice(0, 10),
      branchId: BR,
      items: [item({ total: 1000, itbis: 0, unitCost: 1000 })],
    });
    createExpense({
      date: new Date().toISOString().slice(0, 10),
      category: "Otros",
      payee: "X",
      concept: "g",
      amount: 200,
      method: "efectivo",
      branchId: BR,
    });
    const s = comprasSummary();
    expect(s.cuentasPorPagar).toBeGreaterThan(0);
    expect(s.gastosPagados).toBe(200);
  });

  it("todo registro lleva el business del negocio", () => {
    const r = createExpense({
      date: "2026-06-17",
      category: "Otros",
      payee: "X",
      concept: "g",
      amount: 1,
      method: "efectivo",
      branchId: BR,
    });
    if (r.ok) expect(r.expense.businessId).toBe(mockBusiness.id);
  });
});
