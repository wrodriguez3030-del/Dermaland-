import { describe, it, expect } from "vitest";
import {
  salesByBranch,
  paymentsByMethod,
  monthlyTrend,
  topProducts,
  buildInsights,
} from "./dashboard-metrics";
import type { Proforma } from "@/types";

const REF = new Date(2026, 6, 15); // 15 jul 2026

function doc(over: Partial<Proforma>): Proforma {
  return {
    id: "p1", number: "F-1", customerName: "Cliente", cashierId: "u1",
    cashierName: "Cajero", items: [], subtotal: 0, discount: 0, itbis: 0,
    total: 0, status: "paid", payments: [], paid: 0, balance: 0,
    businessId: "b", branchId: "br1",
    createdAt: "2026-07-10T10:00:00Z", updatedAt: "2026-07-10T10:00:00Z",
    ...over,
  } as Proforma;
}

const docs: Proforma[] = [
  doc({ id: "1", branchId: "br1", total: 1000, payments: [{ id: "x", proformaId: "1", method: "cash", amount: 1000 } as never] }),
  doc({ id: "2", branchId: "br2", total: 3000, payments: [{ id: "y", proformaId: "2", method: "card", amount: 3000 } as never] }),
  doc({ id: "3", branchId: "br1", total: 500, createdAt: "2026-06-05T10:00:00Z" }), // mes anterior
  doc({
    id: "4", branchId: "br1", total: 2000,
    items: [
      { productId: "a", productSku: "SKU-A", productName: "Crema A", quantity: 2, unitPrice: 500, itbisRate: 0, discount: 0, subtotal: 1000, itbis: 0, total: 1000 },
      { productId: "b", productSku: "SKU-B", productName: "Serum B", quantity: 1, unitPrice: 1000, itbisRate: 0, discount: 0, subtotal: 1000, itbis: 0, total: 1000 },
    ],
  }),
];

describe("dashboard-metrics", () => {
  it("salesByBranch agrupa solo el mes actual y ordena desc", () => {
    const r = salesByBranch(docs, (id) => (id === "br1" ? "Santiago" : "Naco"), REF);
    expect(r).toEqual([
      { label: "Santiago", value: 3000 }, // 1000 + 2000 (la de junio queda fuera)
      { label: "Naco", value: 3000 },
    ].sort((a, b) => b.value - a.value));
    expect(r.reduce((s, x) => s + x.value, 0)).toBe(6000);
  });

  it("paymentsByMethod suma pagos del mes con etiquetas en español", () => {
    const r = paymentsByMethod(docs, REF);
    expect(r.find((x) => x.label === "Efectivo")?.value).toBe(1000);
    expect(r.find((x) => x.label === "Tarjeta")?.value).toBe(3000);
  });

  it("monthlyTrend devuelve N meses con totales por mes", () => {
    const r = monthlyTrend(docs, 3, REF);
    expect(r).toHaveLength(3);
    expect(r[0]!.label).toMatch(/May 2026/);
    expect(r[1]).toMatchObject({ value: 500 }); // junio
    expect(r[2]!.value).toBe(6000); // julio
  });

  it("topProducts rankea por monto del mes", () => {
    const r = topProducts(docs, 5, REF);
    expect(r).toHaveLength(2);
    expect(r[0]!.total).toBe(1000);
    expect(r.map((x) => x.sku).sort()).toEqual(["SKU-A", "SKU-B"]);
    expect(r.find((x) => x.sku === "SKU-A")?.units).toBe(2);
  });

  it("buildInsights produce mensajes según el estado", () => {
    const ins = buildInsights({
      branchLeader: { label: "Santiago", value: 3000 },
      topProduct: { name: "Crema A", sku: "SKU-A", units: 2, total: 1000 },
      criticalExpiring: 2,
      lowStock: 0,
      formatCurrency: (n) => `RD$${n}`,
    });
    expect(ins.some((i) => i.title.includes("Santiago lidera"))).toBe(true);
    expect(ins.some((i) => i.tone === "warn" && i.title.includes("15 días"))).toBe(true);
    expect(ins.some((i) => i.tone === "good" && i.title === "Stock saludable")).toBe(true);
  });
});
