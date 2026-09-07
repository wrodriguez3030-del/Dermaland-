import { describe, it, expect } from "vitest";
import {
  salesByBranch,
  paymentsByMethod,
  monthlyTrend,
  topProducts,
  buildInsights,
  claveMes,
  mesesDeLaTendencia,
  MONTHS_ES,
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
      topProduct: { productId: "a", name: "Crema A", sku: "SKU-A", units: 2, total: 1000 },
      criticalExpiring: 2,
      lowStock: 0,
      formatCurrency: (n) => `RD$${n}`,
    });
    expect(ins.some((i) => i.title.includes("Santiago lidera"))).toBe(true);
    expect(ins.some((i) => i.tone === "warn" && i.title.includes("15 días"))).toBe(true);
    expect(ins.some((i) => i.tone === "good" && i.title === "Stock saludable")).toBe(true);
  });
});

/**
 * 🔴 Los cubos de la tendencia son la ÚNICA cosa que hace que la mitad del
 * sistema y la mitad migrada de Alegra caigan en el mismo mes.
 *
 * La gráfica «Tendencia mensual (ventas)» del panel dibuja seis puntos. Los
 * totales del sistema los pone `monthlyTrend`; los del histórico los pone la
 * base (`desglose_ventas_unificadas`, dimensión `mes`), que devuelve una clave
 * `YYYY-MM` por mes. Si las claves de aquí no fueran EXACTAMENTE ésas, el
 * histórico no encontraría su cubo y la línea seguiría plana en cero — el
 * fallo que este trabajo vino a cerrar, entrando por la puerta de al lado.
 */
describe("cubos de la tendencia mensual", () => {
  it("claveMes escribe `YYYY-MM` con el mes a dos cifras", () => {
    // Enero es '01', no '1': ordenado como texto, '2026-1' iría después de
    // '2026-12' y la serie saldría desordenada.
    expect(claveMes(new Date(2026, 0, 31))).toBe("2026-01");
    expect(claveMes(new Date(2026, 8, 1))).toBe("2026-09");
    expect(claveMes(new Date(2026, 11, 25))).toBe("2026-12");
  });

  it("las claves ordenan cronológicamente como TEXTO", () => {
    const claves = mesesDeLaTendencia(6, REF).map((m) => m.clave);
    expect(claves).toEqual([...claves].sort());
    expect(claves).toEqual([
      "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
    ]);
  });

  it("la etiqueta es el mes en español y su año, del más viejo al más nuevo", () => {
    expect(mesesDeLaTendencia(3, REF)).toEqual([
      { clave: "2026-05", etiqueta: "May 2026" },
      { clave: "2026-06", etiqueta: "Jun 2026" },
      { clave: "2026-07", etiqueta: "Jul 2026" },
    ]);
  });

  it("cruza el año hacia atrás sin inventar meses", () => {
    // Febrero de 2026 menos tres meses es noviembre de 2025, no el mes -1.
    expect(mesesDeLaTendencia(4, new Date(2026, 1, 10))).toEqual([
      { clave: "2025-11", etiqueta: "Nov 2025" },
      { clave: "2025-12", etiqueta: "Dic 2025" },
      { clave: "2026-01", etiqueta: "Ene 2026" },
      { clave: "2026-02", etiqueta: "Feb 2026" },
    ]);
  });

  it("🔴 monthlyTrend usa ESOS cubos: cada punto lleva la etiqueta de su clave", () => {
    // Sin esto, `monthlyTrend` podría etiquetar «Jul 2026» un cubo cuya clave
    // es otra, y el histórico migrado se sumaría en el punto equivocado.
    const cubos = mesesDeLaTendencia(3, REF);
    const serie = monthlyTrend(docs, 3, REF);
    expect(serie.map((p) => p.label)).toEqual(cubos.map((c) => c.etiqueta));
  });

  it("MONTHS_ES tiene los doce meses, en orden", () => {
    expect(MONTHS_ES).toHaveLength(12);
    expect(MONTHS_ES[0]).toBe("Ene");
    expect(MONTHS_ES[8]).toBe("Sep");
    expect(MONTHS_ES[11]).toBe("Dic");
  });
});
