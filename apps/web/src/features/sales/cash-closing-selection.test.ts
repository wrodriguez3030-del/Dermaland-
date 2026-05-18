import { describe, it, expect } from "vitest";
import {
  selectProformasFifo,
  computeTargetAmount,
} from "./cash-closing-selection";
import type { Proforma } from "@/types";

function makeProforma(
  id: string,
  total: number,
  createdAt: string,
): Proforma {
  return {
    id,
    businessId: "biz_dermaland",
    branchId: "br_santiago",
    number: `PROF-${id}`,
    customerName: "X",
    cashierId: "u1",
    cashierName: "C",
    items: [],
    subtotal: total / 1.18,
    discount: 0,
    itbis: total - total / 1.18,
    total,
    status: "paid",
    payments: [],
    paid: total,
    balance: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("computeTargetAmount", () => {
  it("calcula 10% de 1000 = 100", () => {
    expect(computeTargetAmount(1000, 10)).toBe(100);
  });
  it("clampa porcentaje a 0..100", () => {
    expect(computeTargetAmount(1000, -5)).toBe(0);
    expect(computeTargetAmount(1000, 150)).toBe(1000);
  });
  it("0% siempre da 0", () => {
    expect(computeTargetAmount(1234, 0)).toBe(0);
  });
});

describe("selectProformasFifo", () => {
  const proformas: Proforma[] = [
    makeProforma("p1", 100, "2026-05-17T08:00:00Z"),
    makeProforma("p2", 200, "2026-05-17T09:00:00Z"),
    makeProforma("p3", 300, "2026-05-17T10:00:00Z"),
    makeProforma("p4", 400, "2026-05-17T11:00:00Z"),
  ];

  it("targetAmount=0 → no selecciona nada", () => {
    const r = selectProformasFifo({ proformas, targetAmount: 0 });
    expect(r.selectedIds).toEqual([]);
    expect(r.selectedAmount).toBe(0);
    expect(r.selectedCount).toBe(0);
    expect(r.remainingAmount).toBe(1000);
    expect(r.remainingCount).toBe(4);
  });

  it("targetAmount >= total → selecciona todas", () => {
    const r = selectProformasFifo({ proformas, targetAmount: 999999 });
    expect(r.selectedIds).toHaveLength(4);
    expect(r.selectedAmount).toBe(1000);
    expect(r.remainingCount).toBe(0);
    expect(r.remainingAmount).toBe(0);
  });

  it("selecciona FIFO (más antiguas primero)", () => {
    const r = selectProformasFifo({ proformas, targetAmount: 250 });
    expect(r.selectedIds).toEqual(["p1", "p2"]);
    expect(r.selectedAmount).toBe(300); // overshoot 100
    expect(r.difference).toBe(50);
  });

  it("monto exacto = la primera proforma", () => {
    const r = selectProformasFifo({ proformas, targetAmount: 100 });
    expect(r.selectedIds).toEqual(["p1"]);
    expect(r.selectedAmount).toBe(100);
    expect(r.difference).toBe(0);
  });

  it("ordena por createdAt asc aunque entren desordenadas", () => {
    const desordenadas = [...proformas].reverse(); // p4, p3, p2, p1
    const r = selectProformasFifo({
      proformas: desordenadas,
      targetAmount: 500,
    });
    // Debería seleccionar p1, p2, p3 (en ese orden) hasta cubrir 500.
    expect(r.selectedIds).toEqual(["p1", "p2", "p3"]);
    expect(r.selectedAmount).toBe(600);
  });

  it("lista vacía → resultado vacío", () => {
    const r = selectProformasFifo({ proformas: [], targetAmount: 100 });
    expect(r.selectedIds).toEqual([]);
    expect(r.selectedAmount).toBe(0);
    expect(r.remainingCount).toBe(0);
  });

  it("targetAmount negativo se trata como 0", () => {
    const r = selectProformasFifo({ proformas, targetAmount: -100 });
    expect(r.selectedIds).toEqual([]);
    expect(r.selectedCount).toBe(0);
  });

  it("difference negativa cuando no se alcanza target con selección completa", () => {
    const pocas = [makeProforma("p1", 50, "2026-05-17T08:00:00Z")];
    const r = selectProformasFifo({ proformas: pocas, targetAmount: 200 });
    // Selecciona todas pero sigue corto.
    expect(r.selectedAmount).toBe(50);
    expect(r.difference).toBe(-150);
  });
});
