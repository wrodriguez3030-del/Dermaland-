import { describe, it, expect } from "vitest";
import type { Payment, PaymentMethod, Proforma } from "@/types";
import {
  commissionForSale,
  buildCommissionReport,
  resolveCommissionRule,
} from "./commission-engine";
import { DEFAULT_COMMISSION_RULES } from "./commission-rules";

let seq = 0;
function pay(method: PaymentMethod, amount: number): Payment {
  seq += 1;
  return {
    id: `pay${seq}`,
    proformaId: "x",
    method,
    amount,
    userId: "u1",
    userName: "Rosa",
    createdAt: "2026-05-30T10:00:00Z",
  };
}

function sale(over: Partial<Proforma> & { method?: PaymentMethod }): Proforma {
  const { method, ...rest } = over;
  const subtotal = over.subtotal ?? 1000;
  const discount = over.discount ?? 0;
  const itbis = over.itbis ?? 0;
  return {
    id: over.id ?? `s${++seq}`,
    businessId: "biz_dermaland",
    branchId: over.branchId ?? "b_cutis",
    number: over.number ?? "B0200012923",
    ecfNumber: over.ecfNumber,
    customerId: undefined,
    customerName: over.customerName ?? "Cliente X",
    cashierId: over.cashierId ?? "u_rosa",
    cashierName: over.cashierName ?? "Rosa Peralta",
    sellerId: over.sellerId,
    sellerName: over.sellerName,
    items: over.items ?? [],
    subtotal,
    discount,
    itbis,
    total: over.total ?? subtotal - discount + itbis,
    status: over.status ?? "paid",
    payments: over.payments ?? (method ? [pay(method, subtotal - discount + itbis)] : [pay("cash", 1000)]),
    paid: subtotal,
    balance: 0,
    documentKind: over.documentKind ?? "invoice",
    ecfType: over.ecfType,
    createdAt: over.createdAt ?? "2026-05-30T10:00:00Z",
    updatedAt: "2026-05-30T10:00:00Z",
  };
}

const RULES = DEFAULT_COMMISSION_RULES;

describe("resolveCommissionRule", () => {
  it("efectivo → regla 3%", () => {
    expect(resolveCommissionRule("cash", { branchId: "b", sellerId: undefined, date: "2026-05-30" }, RULES)?.percentage).toBe(3);
  });
  it("transferencia → regla 3%", () => {
    expect(resolveCommissionRule("transfer", { branchId: "b", date: "2026-05-30" }, RULES)?.percentage).toBe(3);
  });
  it("tarjeta → regla 1%", () => {
    expect(resolveCommissionRule("card", { branchId: "b", date: "2026-05-30" }, RULES)?.percentage).toBe(1);
  });
  it("otro/mixto/none → sin regla", () => {
    expect(resolveCommissionRule("other", { date: "2026-05-30" }, RULES)).toBeNull();
    expect(resolveCommissionRule("mixed", { date: "2026-05-30" }, RULES)).toBeNull();
    expect(resolveCommissionRule("none", { date: "2026-05-30" }, RULES)).toBeNull();
  });
});

describe("commissionForSale", () => {
  it("4/5. base = subtotal − descuento (antes de ITBIS)", () => {
    const line = commissionForSale(sale({ method: "cash", subtotal: 10000, discount: 1000, itbis: 1620 }), RULES);
    expect(line.base).toBe(9000);
    expect(line.commission).toBe(270); // 9000 * 3%
  });
  it("6. el ITBIS NO genera comisión (misma comisión con o sin ITBIS)", () => {
    const a = commissionForSale(sale({ method: "cash", subtotal: 1500, itbis: 0 }), RULES);
    const b = commissionForSale(sale({ method: "cash", subtotal: 1500, itbis: 270 }), RULES);
    expect(a.commission).toBe(45);
    expect(b.commission).toBe(45);
  });
  it("7. efectivo 3% (CASO Excel B0200012923: 1500 → 45)", () => {
    const line = commissionForSale(sale({ method: "cash", subtotal: 1500 }), RULES);
    expect(line.ratePercent).toBe(3);
    expect(line.commission).toBe(45);
    expect(line.status).toBe("commissionable");
  });
  it("8. tarjeta 1% (8042.37 → 80.42)", () => {
    const line = commissionForSale(sale({ method: "card", subtotal: 8042.37, itbis: 1447.63 }), RULES);
    expect(line.ratePercent).toBe(1);
    expect(line.commission).toBeCloseTo(80.42, 2);
  });
  it("transferencia 3%", () => {
    const line = commissionForSale(sale({ method: "transfer", subtotal: 2300.86 }), RULES);
    expect(line.ratePercent).toBe(3);
    expect(line.commission).toBeCloseTo(69.03, 2);
  });
  it("9. venta con método sin regla (paypal) → sin_regla, comisión 0", () => {
    const line = commissionForSale(sale({ method: "paypal", subtotal: 5000 }), RULES);
    expect(line.status).toBe("no_rule");
    expect(line.commission).toBe(0);
  });
  it("10. venta anulada → cancelada, comisión 0", () => {
    const line = commissionForSale(sale({ method: "cash", subtotal: 5000, status: "cancelled" }), RULES);
    expect(line.status).toBe("cancelled");
    expect(line.commission).toBe(0);
  });
  it("exclusión manual por comprobante → excluida, comisión 0", () => {
    const line = commissionForSale(sale({ method: "cash", subtotal: 5000, number: "B0200099999" }), RULES, ["B0200099999"]);
    expect(line.status).toBe("excluded");
    expect(line.commission).toBe(0);
  });
});

describe("buildCommissionReport", () => {
  const branchNames = new Map([["b_cutis", "DermaLand Cutis"], ["b_olga", "Villa Olga"]]);
  const sales: Proforma[] = [
    sale({ id: "s1", method: "cash", subtotal: 1500, sellerId: "v1", sellerName: "Wilson", branchId: "b_cutis", number: "B01" }),
    sale({ id: "s2", method: "card", subtotal: 10000, itbis: 1800, sellerId: "v1", sellerName: "Wilson", branchId: "b_cutis", number: "B02" }),
    sale({ id: "s3", method: "transfer", subtotal: 2000, sellerId: "v2", sellerName: "Ana", branchId: "b_olga", number: "B03" }),
    sale({ id: "s4", method: "cash", subtotal: 5000, status: "cancelled", sellerId: "v2", sellerName: "Ana", branchId: "b_olga", number: "B04" }),
    sale({ id: "s5", method: "paypal", subtotal: 3000, sellerId: undefined, branchId: "b_cutis", number: "B05" }),
  ];
  const report = buildCommissionReport(sales, {}, RULES, { branchNames });

  it("KPIs: comisionables=3, base=13500, com3%=105, com1%=100, total=205", () => {
    // cash 1500→45(3%), card 10000→100(1%), transfer 2000→60(3%)
    expect(report.kpis.commissionableSales).toBe(3);
    expect(report.kpis.commissionableBase).toBe(13500);
    expect(report.kpis.commission3).toBe(105); // 45 + 60
    expect(report.kpis.commission1).toBe(100);
    expect(report.kpis.commissionTotal).toBe(205);
    expect(report.kpis.excludedSales).toBe(2); // cancelada + sin_regla
    expect(report.kpis.pendingCommission).toBe(205);
    expect(report.kpis.paidCommission).toBe(0);
  });

  it("14. agrupa por vendedor, ordenado por comisión desc", () => {
    expect(report.bySeller[0]!.sellerName).toBe("Wilson"); // 45+100=145
    expect(report.bySeller[0]!.commissionTotal).toBe(145);
    expect(report.bySeller[1]!.sellerName).toBe("Ana"); // 60 (cancelada no suma)
    expect(report.bySeller[1]!.commissionTotal).toBe(60);
  });

  it("15. agrupa por método (efectivo/tarjeta/transferencia)", () => {
    const cash = report.byMethod.find((m) => m.group === "cash")!;
    const card = report.byMethod.find((m) => m.group === "card")!;
    const transfer = report.byMethod.find((m) => m.group === "transfer")!;
    expect(cash.commission).toBe(45);
    expect(card.commission).toBe(100);
    expect(transfer.commission).toBe(60);
  });

  it("16. agrupa por sucursal", () => {
    const cutis = report.byBranch.find((b) => b.branchName === "DermaLand Cutis")!;
    expect(cutis.commission).toBe(145); // 45 + 100
    const olga = report.byBranch.find((b) => b.branchName === "Villa Olga")!;
    expect(olga.commission).toBe(60);
  });

  it("13. vendedor y cajero son independientes (cashier no altera agrupación por seller)", () => {
    const noSeller = report.bySeller.find((s) => s.sellerId === "__none__");
    expect(noSeller).toBeUndefined(); // s5 (paypal) es sin_regla → no comisionable → no aparece
  });

  it("21. la tabla no expone ids internos (UUID) en comprobante", () => {
    for (const row of report.rows) {
      expect(row.comprobante).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    }
  });
});
