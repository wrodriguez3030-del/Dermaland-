import { describe, it, expect } from "vitest";
import type { Payment, Proforma } from "@/types";
import {
  validateExclusion,
  addExclusionIn,
  removeExclusionIn,
  isExcludedIn,
  excludedComprobantes,
  exclusionReasonMap,
  type CommissionExclusion,
} from "./commission-exclusions-store";
import { buildCommissionReport } from "./commission-engine";

const entry = (comprobante: string, reason = "Cortesía"): CommissionExclusion => ({
  comprobante,
  reason,
  userName: "Admin",
  createdAt: "2026-06-01T00:00:00Z",
});

describe("validateExclusion", () => {
  it("exige comprobante y motivo", () => {
    expect(validateExclusion("", "x")).toMatch(/comprobante/i);
    expect(validateExclusion("B01", "")).toMatch(/motivo/i);
    expect(validateExclusion("B01", "Cortesía")).toBeNull();
  });
});

describe("helpers puros", () => {
  it("agrega y reemplaza por comprobante (sin duplicar)", () => {
    let list = addExclusionIn([], entry("B01", "A"));
    list = addExclusionIn(list, entry("B02", "B"));
    list = addExclusionIn(list, entry("B01", "A2")); // reemplaza
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.comprobante === "B01")!.reason).toBe("A2");
  });
  it("elimina por comprobante", () => {
    const list = removeExclusionIn([entry("B01"), entry("B02")], "B01");
    expect(list.map((e) => e.comprobante)).toEqual(["B02"]);
  });
  it("isExcludedIn / excludedComprobantes / exclusionReasonMap", () => {
    const list = [entry("B01", "Cortesía"), entry("B02", "Ajuste")];
    expect(isExcludedIn(list, "B01")).toBe(true);
    expect(isExcludedIn(list, "B99")).toBe(false);
    expect(excludedComprobantes(list)).toEqual(["B01", "B02"]);
    expect(exclusionReasonMap(list).get("B02")).toBe("Ajuste");
  });
});

describe("integración: una venta excluida deja de comisionar", () => {
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
  const sales = [sale("B01", 1000), sale("B02", 2000)];

  it("sin exclusiones ambas comisionan (3% cada una)", () => {
    const r = buildCommissionReport(sales, {}, undefined, {});
    expect(r.kpis.commissionableSales).toBe(2);
    expect(r.kpis.commissionTotal).toBe(90); // 30 + 60
  });

  it("excluir B01 la marca excluida y no suma", () => {
    const r = buildCommissionReport(sales, {}, undefined, { manualExclusions: ["B01"] });
    expect(r.kpis.commissionableSales).toBe(1);
    expect(r.kpis.commissionTotal).toBe(60); // solo B02
    expect(r.kpis.excludedSales).toBe(1);
    const b01 = r.rows.find((l) => l.comprobante === "B01")!;
    expect(b01.status).toBe("excluded");
    expect(b01.commission).toBe(0);
  });
});
