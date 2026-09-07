import { describe, it, expect } from "vitest";
import type { ProductLot } from "@/types";
import {
  isWithinExpiryWindow,
  lotsExpiringWithin,
  matchesExpiryDayFilter,
  isBlockedLot,
  blockedLots,
  tieneExistencia,
} from "./lot-selectors";

// Construye una fecha ISO a `days` días de hoy. Se usa medianoche local para
// que `daysUntil` (ceil de la diferencia) devuelva EXACTAMENTE `days` sin
// depender de la hora del día (evita el borde flako en 90).
function inDays(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function lot(over: Partial<ProductLot>): ProductLot {
  return {
    id: over.id ?? "lot_x",
    businessId: "biz_1",
    branchId: over.branchId ?? "br_1",
    productId: over.productId ?? "p1",
    warehouseId: over.warehouseId ?? "wh_1",
    lotNumber: over.lotNumber ?? "L-1",
    initialQuantity: 10,
    currentQuantity: over.currentQuantity ?? 10,
    unitCost: 100,
    status: over.status ?? "available",
    receivedAt: inDays(-30),
    expiresAt: over.expiresAt ?? inDays(45),
    createdAt: inDays(-30),
    updatedAt: inDays(-30),
  } as ProductLot;
}

describe("lot-selectors — ventana de vencimiento", () => {
  it("isWithinExpiryWindow: incluye [0, days], excluye vencidos y fuera de rango", () => {
    expect(isWithinExpiryWindow(inDays(0), 90)).toBe(true); // vence hoy
    expect(isWithinExpiryWindow(inDays(45), 90)).toBe(true);
    expect(isWithinExpiryWindow(inDays(90), 90)).toBe(true);
    expect(isWithinExpiryWindow(inDays(120), 90)).toBe(false); // más de 90
    expect(isWithinExpiryWindow(inDays(-1), 90)).toBe(false); // ya vencido
  });

  it("lotsExpiringWithin: solo sucursales activas y ≤ days, ordenado", () => {
    const lots = [
      lot({ id: "a", branchId: "br_1", expiresAt: inDays(80) }),
      lot({ id: "b", branchId: "br_1", expiresAt: inDays(10) }),
      lot({ id: "c", branchId: "br_off", expiresAt: inDays(20) }), // sucursal inactiva
      lot({ id: "d", branchId: "br_1", expiresAt: inDays(200) }), // fuera de 90
      lot({ id: "e", branchId: "br_1", expiresAt: inDays(-5) }), // vencido
    ];
    const active = new Set(["br_1"]);
    const res = lotsExpiringWithin(lots, active, 90);
    expect(res.map((l) => l.id)).toEqual(["b", "a"]); // ordenado por fecha asc
  });
});

describe("lot-selectors — coherencia KPI ↔ /inventario/vencimientos?days=90", () => {
  it("el conteo del KPI == el conteo del filtro days=90 de la pantalla", () => {
    const active = new Set(["br_1", "br_2"]);
    const lots = [
      lot({ id: "1", branchId: "br_1", expiresAt: inDays(5) }),
      lot({ id: "2", branchId: "br_2", expiresAt: inDays(89) }),
      lot({ id: "3", branchId: "br_1", expiresAt: inDays(91) }), // fuera
      lot({ id: "4", branchId: "off", expiresAt: inDays(10) }), // inactiva
      lot({ id: "5", branchId: "br_1", expiresAt: inDays(-2), status: "quarantine" }),
      lot({ id: "6", branchId: "br_2", expiresAt: inDays(30), status: "quarantine" }),
    ];

    // KPI del dashboard.
    const kpiCount = lotsExpiringWithin(lots, active, 90).length;

    // Réplica del filtro de la pantalla Vencimientos con days=90: opera sobre
    // lotes de sucursales activas y aplica el MISMO predicado de plazo.
    const screenCount = lots
      .filter((l) => active.has(l.branchId))
      .filter((l) => matchesExpiryDayFilter(l.expiresAt, "90")).length;

    expect(kpiCount).toBe(screenCount);
    expect(kpiCount).toBe(3); // #1, #2, #6
  });

  it("matchesExpiryDayFilter respeta cada plazo", () => {
    expect(matchesExpiryDayFilter(inDays(-3), "expired")).toBe(true);
    expect(matchesExpiryDayFilter(inDays(3), "expired")).toBe(false);
    expect(matchesExpiryDayFilter(inDays(20), "30")).toBe(true);
    expect(matchesExpiryDayFilter(inDays(45), "30")).toBe(false);
    expect(matchesExpiryDayFilter(inDays(200), "all")).toBe(true);
  });
});

describe("lot-selectors — bloqueados (cuarentena + recall)", () => {
  it("isBlockedLot solo cuenta cuarentena y recall (no vencidos disponibles)", () => {
    expect(isBlockedLot({ status: "quarantine" })).toBe(true);
    expect(isBlockedLot({ status: "recalled" })).toBe(true);
    expect(isBlockedLot({ status: "available" })).toBe(false);
    expect(isBlockedLot({ status: "damaged" })).toBe(false);
    expect(isBlockedLot({ status: "expired" })).toBe(false);
  });

  it("blockedLots devuelve la unión cuarentena + recall = suma de ambas pestañas", () => {
    const lots = [
      lot({ id: "q1", status: "quarantine" }),
      lot({ id: "q2", status: "quarantine" }),
      lot({ id: "r1", status: "recalled" }),
      lot({ id: "ok", status: "available" }),
    ];
    const all = blockedLots(lots);
    const cuarentena = all.filter((l) => l.status === "quarantine");
    const recall = all.filter((l) => l.status === "recalled");
    expect(all).toHaveLength(3);
    // Coherencia de la pestaña "Todos" = Cuarentena + Recall.
    expect(all.length).toBe(cuarentena.length + recall.length);
  });
});

/**
 * 🔴 Un lote agotado no vence nada.
 *
 * El panel llegó a enseñar «Lote 4545345 · 0 unid. · vence en 72 días» como una
 * alerta, y de los 16 lotes vencidos en producción solo 3 tenían unidades. Una
 * lista de alertas con ruido se deja de mirar, que es la peor forma de fallar
 * que tiene una alerta.
 */
describe("solo lo que tiene existencia entra en los vencimientos", () => {
  const activas = new Set(["b1"]);
  const lote = (id: string, currentQuantity: number, dias: number): ProductLot => {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    return {
      id,
      branchId: "b1",
      currentQuantity,
      expiresAt: f.toISOString().slice(0, 10),
      status: "available",
    } as ProductLot;
  };

  it("🔴 un lote en CERO no sale como próximo a vencer", () => {
    const r = lotsExpiringWithin([lote("vacío", 0, 30)], activas, 90);
    expect(r).toHaveLength(0);
  });

  it("uno con unidades sí sale", () => {
    const r = lotsExpiringWithin([lote("lleno", 5, 30)], activas, 90);
    expect(r.map((l) => l.id)).toEqual(["lleno"]);
  });

  it("🔴 entre uno lleno y uno vacío, solo se avisa del lleno", () => {
    const r = lotsExpiringWithin([lote("vacío", 0, 10), lote("lleno", 3, 40)], activas, 90);
    expect(r.map((l) => l.id)).toEqual(["lleno"]);
  });

  it("una cantidad negativa tampoco cuenta", () => {
    expect(lotsExpiringWithin([lote("negativo", -2, 30)], activas, 90)).toHaveLength(0);
  });

  it("tieneExistencia mira la cantidad, no el estado", () => {
    // Un lote en cuarentena CON unidades sí vence y hay que verlo.
    expect(tieneExistencia({ currentQuantity: 1 })).toBe(true);
    expect(tieneExistencia({ currentQuantity: 0 })).toBe(false);
  });
});
