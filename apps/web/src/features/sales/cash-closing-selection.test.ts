import { describe, it, expect } from "vitest";
import {
  selectProformasFifo,
  computeTargetAmount,
  selectSalesForEcfClosing,
  summarizeEcfSelection,
  type EcfClosingSale,
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

describe("selectSalesForEcfClosing — redondeo hacia arriba por factura completa", () => {
  // Ejemplo canónico del documento DGII §7-8.
  const ventas: EcfClosingSale[] = [
    { id: "v1", amount: 1000, createdAt: "2026-06-26T08:00:00Z" },
    { id: "v2", amount: 800, createdAt: "2026-06-26T09:00:00Z" },
    { id: "v3", amount: 500, createdAt: "2026-06-26T10:00:00Z" },
    // Relleno para que el total sea 10,000.
    { id: "v4", amount: 7700, createdAt: "2026-06-26T07:00:00Z" },
  ];

  it("estrategia 'first': 15% de 10,000 → objetivo 1,500, genera 1,800, dif 300", () => {
    // 'first' = más antiguas primero. v4 (7700) es la más antigua y supera el
    // objetivo por sí sola, así que usamos un set sin el relleno para reproducir
    // exactamente el ejemplo del documento.
    const ejemplo: EcfClosingSale[] = [
      { id: "v1", amount: 1000, createdAt: "2026-06-26T08:00:00Z" },
      { id: "v2", amount: 800, createdAt: "2026-06-26T09:00:00Z" },
      { id: "v3", amount: 500, createdAt: "2026-06-26T10:00:00Z" },
    ];
    // total 2,300; para que el objetivo sea 1,500 necesitamos % ≈ 65.2; en su
    // lugar probamos directamente con objetivo via summarize para el caso doc.
    const r = selectSalesForEcfClosing({
      sales: ejemplo,
      percentage: 100 * (1500 / 2300),
      strategy: "first",
    });
    expect(r.targetAmount).toBeCloseTo(1500, 5);
    expect(r.selectedIds).toEqual(["v1", "v2"]);
    expect(r.generatedAmount).toBe(1800);
    expect(r.roundingDifference).toBeCloseTo(300, 5);
  });

  it("nunca divide una venta: selecciona completas hasta superar objetivo", () => {
    const r = selectSalesForEcfClosing({
      sales: ventas,
      percentage: 15,
      strategy: "first",
    });
    // total 10,000 · 15% = objetivo 1,500. 'first' empieza por v4 (7700).
    expect(r.targetAmount).toBe(1500);
    expect(r.selectedIds).toEqual(["v4"]);
    expect(r.generatedAmount).toBe(7700);
    expect(r.roundingDifference).toBe(6200);
  });

  it("estrategia 'last' selecciona las más recientes primero", () => {
    const r = selectSalesForEcfClosing({
      sales: ventas,
      percentage: 12, // objetivo 1,200
      strategy: "last",
    });
    // 'last' → v3(500,10h) primero, luego v2(800,9h) = 1,300 ≥ 1,200.
    expect(r.selectedIds).toEqual(["v3", "v2"]);
    expect(r.generatedAmount).toBe(1300);
    expect(r.roundingDifference).toBe(100);
  });

  it("estrategia 'manual' no auto-selecciona", () => {
    const r = selectSalesForEcfClosing({
      sales: ventas,
      percentage: 50,
      strategy: "manual",
    });
    expect(r.selectedIds).toEqual([]);
    expect(r.pendingAmount).toBe(10000);
  });

  it("0% → no selecciona nada", () => {
    const r = selectSalesForEcfClosing({ sales: ventas, percentage: 0 });
    expect(r.selectedIds).toEqual([]);
    expect(r.targetAmount).toBe(0);
  });

  it("100% → selecciona todas", () => {
    const r = selectSalesForEcfClosing({ sales: ventas, percentage: 100 });
    expect(r.selectedCount).toBe(4);
    expect(r.generatedAmount).toBe(10000);
    expect(r.pendingAmount).toBe(0);
  });
});

describe("summarizeEcfSelection — ajuste manual", () => {
  const ventas: EcfClosingSale[] = [
    { id: "v1", amount: 1000, createdAt: "2026-06-26T08:00:00Z" },
    { id: "v2", amount: 800, createdAt: "2026-06-26T09:00:00Z" },
    { id: "v3", amount: 500, createdAt: "2026-06-26T10:00:00Z" },
  ];

  it("reproduce el ejemplo del documento: selecciona v1+v2 → 1,800 / dif 300", () => {
    // total 2,300; objetivo manual representado con % = 1500/2300.
    const r = summarizeEcfSelection(ventas, ["v1", "v2"], 100 * (1500 / 2300));
    expect(r.generatedAmount).toBe(1800);
    expect(r.targetAmount).toBeCloseTo(1500, 5);
    expect(r.roundingDifference).toBeCloseTo(300, 5);
    expect(r.selectedCount).toBe(2);
  });

  it("no altera montos: usa los amounts originales", () => {
    const r = summarizeEcfSelection(ventas, ["v3"], 10);
    expect(r.generatedAmount).toBe(500);
  });
});
