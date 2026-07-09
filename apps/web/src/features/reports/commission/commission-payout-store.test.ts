import { describe, it, expect } from "vitest";
import type { Payment, Proforma } from "@/types";
import {
  setPayoutIn,
  clearPayoutIn,
  payoutMap,
  type PayoutRecord,
} from "./commission-payout-store";
import { addBatchIn, type CommissionBatch } from "./commission-batch-store";
import { addAuditIn, type CommissionAuditEntry } from "./commission-audit-store";
import { buildCommissionReport } from "./commission-engine";

describe("payout store — helpers puros", () => {
  it("marca comprobantes con un estado (reemplaza duplicados)", () => {
    let list: PayoutRecord[] = [];
    list = setPayoutIn(list, ["B01", "B02"], "approved", "Admin", "t1");
    list = setPayoutIn(list, ["B01"], "paid", "Admin", "t2"); // reemplaza B01
    expect(list.filter((r) => r.comprobante === "B01")).toHaveLength(1);
    expect(list.find((r) => r.comprobante === "B01")!.status).toBe("paid");
    expect(list.find((r) => r.comprobante === "B02")!.status).toBe("approved");
  });
  it("clear elimina el estado (vuelve a pendiente por defecto)", () => {
    const list = setPayoutIn([], ["B01", "B02"], "paid", "Admin", "t");
    expect(clearPayoutIn(list, ["B01"]).map((r) => r.comprobante)).toEqual(["B02"]);
  });
  it("payoutMap arma el Map comprobante→estado para el motor", () => {
    const map = payoutMap(setPayoutIn([], ["B01"], "paid", "Admin", "t"));
    expect(map.get("B01")).toBe("paid");
  });
});

describe("batch / audit — helpers puros", () => {
  it("addBatchIn antepone el lote", () => {
    const b: CommissionBatch = {
      id: "batch1", comprobantes: ["B01"], total: 45, status: "paid",
      createdBy: "Admin", createdAt: "t",
    };
    expect(addBatchIn([], b)).toHaveLength(1);
  });
  it("addAuditIn antepone y respeta el tope", () => {
    const e: CommissionAuditEntry = {
      id: "a1", action: "paid", comprobantes: ["B01"], userName: "Admin", at: "t",
    };
    const list = addAuditIn([], e);
    expect(list[0]!.id).toBe("a1");
  });
});

describe("integración: el estado de pago cambia las KPIs pagada/pendiente", () => {
  let seq = 0;
  function sale(comprobante: string, subtotal: number): Proforma {
    seq += 1;
    const pay: Payment = {
      id: `p${seq}`, proformaId: `s${seq}`, method: "cash", amount: subtotal,
      userId: "u", userName: "Rosa", createdAt: "2026-06-01T10:00:00Z",
    };
    return {
      id: `s${seq}`, businessId: "biz_dermaland", branchId: "b1", number: comprobante,
      customerName: "X", cashierId: "u", cashierName: "Rosa", sellerId: "v1", sellerName: "Wilson",
      items: [], subtotal, discount: 0, itbis: 0, total: subtotal, status: "paid",
      payments: [pay], paid: subtotal, balance: 0, documentKind: "invoice",
      createdAt: "2026-06-01T10:00:00Z", updatedAt: "2026-06-01T10:00:00Z",
    };
  }
  const sales = [sale("B01", 1000), sale("B02", 2000)]; // 30 + 60 = 90

  it("sin pagos: todo pendiente", () => {
    const r = buildCommissionReport(sales, {}, undefined, {});
    expect(r.kpis.commissionTotal).toBe(90);
    expect(r.kpis.pendingCommission).toBe(90);
    expect(r.kpis.paidCommission).toBe(0);
  });

  it("marcar B01 pagada mueve su comisión a pagada", () => {
    const payoutByComprobante = payoutMap(setPayoutIn([], ["B01"], "paid", "Admin", "t"));
    const r = buildCommissionReport(sales, {}, undefined, { payoutByComprobante });
    expect(r.kpis.paidCommission).toBe(30);
    expect(r.kpis.pendingCommission).toBe(60);
    const b01 = r.rows.find((l) => l.comprobante === "B01")!;
    expect(b01.payout).toBe("paid");
    expect(b01.payoutLabel).toBe("Pagada");
  });

  it("aprobar cuenta como pendiente de pago (aún no pagada)", () => {
    const payoutByComprobante = payoutMap(setPayoutIn([], ["B01"], "approved", "Admin", "t"));
    const r = buildCommissionReport(sales, {}, undefined, { payoutByComprobante });
    expect(r.kpis.paidCommission).toBe(0);
    expect(r.kpis.pendingCommission).toBe(90);
    expect(r.rows.find((l) => l.comprobante === "B01")!.payoutLabel).toBe("Aprobada");
  });
});
