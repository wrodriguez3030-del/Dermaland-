import { describe, it, expect } from "vitest";
import {
  recalcInvoice,
  validateInvoiceDraft,
  stockDeltasForEdit,
  isSensitiveChange,
  diffInvoiceForAudit,
  draftFromProforma,
  lineFromSaleItem,
  type InvoiceEditDraft,
  type InvoiceEditLine,
} from "./invoice-edit";
import type { Proforma, SaleItem } from "@/types";

function line(over: Partial<InvoiceEditLine> = {}): InvoiceEditLine {
  return {
    productId: "prod_1",
    productSku: "SKU1",
    productName: "Crema facial",
    lotId: "lot_1",
    lotNumber: "L-001",
    quantity: 1,
    unitPrice: 118,
    itbisRate: 18,
    discountAmount: 0,
    ...over,
  };
}

function draft(over: Partial<InvoiceEditDraft> = {}): InvoiceEditDraft {
  return {
    customerName: "María Pérez",
    customerPhone: "809-555-0101",
    customerDocument: "001-0000000-1",
    notes: "",
    items: [line()],
    globalDiscountPercent: 0,
    payments: [{ method: "cash", amount: 118 }],
    ...over,
  };
}

function saleItem(over: Partial<SaleItem> = {}): SaleItem {
  return {
    productId: "prod_1",
    productSku: "SKU1",
    productName: "Crema facial",
    lotId: "lot_1",
    lotNumber: "L-001",
    quantity: 1,
    unitPrice: 118,
    itbisRate: 18,
    discount: 0,
    subtotal: 100,
    itbis: 18,
    total: 118,
    ...over,
  };
}

function proforma(over: Partial<Proforma> = {}): Proforma {
  return {
    id: "prof_1",
    number: "B0200000123",
    customerName: "María Pérez",
    customerPhone: "809-555-0101",
    customerDocument: "001-0000000-1",
    cashierId: "usr_1",
    cashierName: "Rosa",
    branchId: "br_1",
    items: [saleItem()],
    subtotal: 100,
    discount: 0,
    itbis: 18,
    total: 118,
    status: "paid",
    payments: [
      {
        id: "pay_1",
        proformaId: "prof_1",
        method: "cash",
        amount: 118,
        userId: "usr_1",
        userName: "Rosa",
        createdAt: "2026-06-16T18:00:00Z",
      },
    ],
    paid: 118,
    balance: 0,
    documentKind: "invoice",
    createdAt: "2026-06-16T18:00:00Z",
    updatedAt: "2026-06-16T18:00:00Z",
    ...over,
  } as Proforma;
}

describe("recalcInvoice", () => {
  it("1 línea sin descuento: ITBIS incluido cuadra (base+itbis=total)", () => {
    const r = recalcInvoice(draft());
    expect(r.total).toBe(118);
    expect(r.itbis).toBe(18);
    expect(r.subtotal).toBe(100);
    expect(r.discount).toBe(0);
    expect(round(r.subtotal - r.discount + r.itbis)).toBe(r.total);
  });

  it("aumentar cantidad recalcula total proporcionalmente", () => {
    const r = recalcInvoice(draft({ items: [line({ quantity: 3 })] }));
    expect(r.total).toBe(354);
    expect(r.itbis).toBe(54);
  });

  it("editar precio recalcula total", () => {
    const r = recalcInvoice(draft({ items: [line({ unitPrice: 236 })] }));
    expect(r.total).toBe(236);
  });

  it("descuento por línea (monto inclusivo) baja el total", () => {
    const r = recalcInvoice(draft({ items: [line({ discountAmount: 18 })] }));
    expect(r.total).toBe(100);
    expect(round(r.subtotal - r.discount + r.itbis)).toBe(r.total);
  });

  it("descuento global % baja el total y escala el ITBIS", () => {
    const r = recalcInvoice(draft({ globalDiscountPercent: 10 }));
    expect(r.total).toBe(106.2); // 118 - 10%
    expect(r.discountPercent).toBe(10);
  });

  it("suma de pagos define paid y balance", () => {
    const r = recalcInvoice(
      draft({ items: [line({ quantity: 2 })], payments: [{ method: "cash", amount: 100 }] }),
    );
    expect(r.total).toBe(236);
    expect(r.paid).toBe(100);
    expect(r.balance).toBe(136);
  });
});

describe("validateInvoiceDraft", () => {
  it("cliente vacío es inválido", () => {
    expect(validateInvoiceDraft(draft({ customerName: "  " }))).toContain(
      "El nombre del cliente es obligatorio.",
    );
  });

  it("sin ítems es inválido", () => {
    expect(validateInvoiceDraft(draft({ items: [] }))).toContain(
      "La factura debe tener al menos un producto.",
    );
  });

  it("cantidad <= 0 es inválida", () => {
    const errs = validateInvoiceDraft(draft({ items: [line({ quantity: 0 })] }));
    expect(errs.some((e) => e.includes("cantidad"))).toBe(true);
  });

  it("descuento mayor al subtotal de línea es inválido", () => {
    const errs = validateInvoiceDraft(draft({ items: [line({ discountAmount: 999 })] }));
    expect(errs.some((e) => e.toLowerCase().includes("descuento"))).toBe(true);
  });

  it("aumentar cantidad sin stock disponible es inválido", () => {
    const errs = validateInvoiceDraft(
      draft({ items: [line({ quantity: 5 })] }),
      { originalItems: [saleItem({ quantity: 1 })], sellableByLot: { lot_1: 2 } },
    );
    expect(errs.some((e) => e.includes("stock suficiente"))).toBe(true);
  });

  it("aumentar cantidad CON stock disponible es válido", () => {
    const errs = validateInvoiceDraft(
      draft({ items: [line({ quantity: 3 })] }),
      { originalItems: [saleItem({ quantity: 1 })], sellableByLot: { lot_1: 10 } },
    );
    expect(errs).toEqual([]);
  });
});

describe("stockDeltasForEdit", () => {
  it("reducir cantidad devuelve stock (delta negativo)", () => {
    const d = stockDeltasForEdit([saleItem({ quantity: 3 })], [line({ quantity: 1 })]);
    expect(d).toHaveLength(1);
    expect(d[0]!.delta).toBe(-2);
    expect(d[0]!.lotId).toBe("lot_1");
  });

  it("aumentar cantidad consume stock (delta positivo)", () => {
    const d = stockDeltasForEdit([saleItem({ quantity: 1 })], [line({ quantity: 4 })]);
    expect(d[0]!.delta).toBe(3);
  });

  it("eliminar una línea devuelve todo su stock", () => {
    const d = stockDeltasForEdit([saleItem({ quantity: 2 })], []);
    expect(d[0]!.delta).toBe(-2);
  });

  it("cambiar de lote devuelve el viejo y consume el nuevo", () => {
    const d = stockDeltasForEdit(
      [saleItem({ lotId: "lot_A", quantity: 2 })],
      [line({ lotId: "lot_B", quantity: 2 })],
    );
    const a = d.find((x) => x.lotId === "lot_A");
    const b = d.find((x) => x.lotId === "lot_B");
    expect(a!.delta).toBe(-2);
    expect(b!.delta).toBe(2);
  });

  it("sin cambios no genera deltas", () => {
    const d = stockDeltasForEdit([saleItem({ quantity: 2 })], [line({ quantity: 2 })]);
    expect(d).toEqual([]);
  });

  it("líneas sin lote no afectan stock", () => {
    const d = stockDeltasForEdit(
      [saleItem({ lotId: undefined, quantity: 2 })],
      [line({ lotId: undefined, quantity: 5 })],
    );
    expect(d).toEqual([]);
  });
});

describe("isSensitiveChange", () => {
  it("cambiar solo cliente/teléfono NO es sensible", () => {
    const p = proforma();
    expect(isSensitiveChange(p, draft({ customerName: "Otro", customerPhone: "809-000-0000" }))).toBe(
      false,
    );
  });

  it("cambiar cantidad SÍ es sensible", () => {
    const p = proforma();
    expect(isSensitiveChange(p, draft({ items: [line({ quantity: 5 })] }))).toBe(true);
  });

  it("cambiar precio SÍ es sensible", () => {
    const p = proforma();
    expect(isSensitiveChange(p, draft({ items: [line({ unitPrice: 200 })] }))).toBe(true);
  });

  it("cambiar pago SÍ es sensible", () => {
    const p = proforma();
    expect(
      isSensitiveChange(p, draft({ payments: [{ method: "card", amount: 118, last4: "1234" }] })),
    ).toBe(true);
  });
});

describe("diffInvoiceForAudit", () => {
  it("registra el cambio de cliente (antes/después)", () => {
    const p = proforma();
    const changes = diffInvoiceForAudit(p, draft({ customerName: "Nuevo Nombre" }));
    expect(changes.customerName).toEqual({ before: "María Pérez", after: "Nuevo Nombre" });
  });

  it("registra el cambio de total al editar cantidad", () => {
    const p = proforma();
    const changes = diffInvoiceForAudit(p, draft({ items: [line({ quantity: 2 })] }));
    expect(changes.total).toEqual({ before: 118, after: 236 });
    expect(changes.items).toBeDefined();
  });

  it("sin cambios reales devuelve objeto vacío", () => {
    const p = proforma();
    expect(diffInvoiceForAudit(p, draft())).toEqual({});
  });
});

describe("campos operativos (cajero, estado, fecha, tipo)", () => {
  it("cambiar cajero es sensible y se audita", () => {
    const p = proforma();
    const d = draft({ cashierName: "Otro Cajero" });
    expect(isSensitiveChange(p, d)).toBe(true);
    expect(diffInvoiceForAudit(p, d).cashierName).toEqual({
      before: "Rosa",
      after: "Otro Cajero",
    });
  });

  it("cambiar estado a un valor no seguro es inválido", () => {
    const errs = validateInvoiceDraft(draft({ status: "converted_to_ecf" }));
    expect(errs.some((e) => e.includes("estado"))).toBe(true);
  });

  it("cambiar estado a un valor seguro es válido y sensible", () => {
    const p = proforma({ status: "paid" });
    const d = draft({ status: "partially_paid" });
    expect(validateInvoiceDraft(d)).toEqual([]);
    expect(isSensitiveChange(p, d)).toBe(true);
    expect(diffInvoiceForAudit(p, d).status).toEqual({ before: "paid", after: "partially_paid" });
  });

  it("fecha de emisión inválida es rechazada", () => {
    const errs = validateInvoiceDraft(draft({ emittedAt: "no-es-fecha" }));
    expect(errs.some((e) => e.includes("fecha de emisión"))).toBe(true);
  });

  it("cambiar tipo de facturación es sensible", () => {
    const p = proforma({ billingType: "consumo" });
    const d = draft({ billingType: "credito_fiscal" });
    expect(isSensitiveChange(p, d)).toBe(true);
  });
});

describe("draftFromProforma / lineFromSaleItem (round-trip)", () => {
  it("reconstruye el descuento inclusivo de una línea", () => {
    const it = saleItem({ unitPrice: 118, quantity: 1, total: 100 });
    expect(lineFromSaleItem(it).discountAmount).toBe(18);
  });

  it("draftFromProforma recalculado reproduce el total original", () => {
    const p = proforma({ items: [saleItem({ quantity: 2, subtotal: 200, itbis: 36, total: 236 })], total: 236, itbis: 36, subtotal: 200 });
    const d = draftFromProforma(p);
    expect(recalcInvoice(d).total).toBe(236);
  });
});

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
