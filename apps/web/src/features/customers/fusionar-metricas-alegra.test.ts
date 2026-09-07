import { describe, it, expect } from "vitest";
import {
  fusionarMetricasAlegra,
  type MetricasClienteAlegra,
} from "./customer-metrics";
import type { CustomerMetricsRow } from "./customer-metrics";
import type { Customer } from "@/types";

/**
 * El Reporte de Clientes y el listado calculaban «Total gastado», «Compras» y
 * «Última visita» desde `proformas`, que tiene 0 filas: 6 524 clientes en
 * RD$0.00 teniendo 14 749 facturas suyas migradas. Un cliente que gastó
 * RD$398 710 salía como si nunca hubiera comprado.
 */

const cliente = (id: string): Customer =>
  ({ id, firstName: "Cliente", lastName: id }) as unknown as Customer;

const fila = (
  id: string,
  totalSpent: number,
  purchases: number,
  lastVisitAt: string | null,
): CustomerMetricsRow => ({
  customer: cliente(id),
  stats: {
    totalSpent,
    purchases,
    avgTicket: purchases > 0 ? totalSpent / purchases : 0,
    lastVisitAt,
    pendingProformas: 0,
  },
});

const alegra = (
  clienteId: string,
  total: number,
  compras: number,
  ultimaFecha: string,
): MetricasClienteAlegra => ({ clienteId, total, compras, ultimaFecha });

describe("fusionar el histórico de Alegra con las métricas del sistema", () => {
  it("🔴 un cliente sin ventas propias deja de salir en cero", () => {
    const [r] = fusionarMetricasAlegra(
      [fila("c1", 0, 0, null)],
      [alegra("c1", 398710.49, 162, "2026-08-28")],
    );
    expect(r!.stats.totalSpent).toBe(398710.49);
    expect(r!.stats.purchases).toBe(162);
    expect(r!.stats.lastVisitAt).toBe("2026-08-28");
  });

  it("🔴 suma las dos mitades, no reemplaza una por la otra", () => {
    const [r] = fusionarMetricasAlegra(
      [fila("c1", 1000, 2, "2026-09-06T10:00")],
      [alegra("c1", 500, 3, "2026-09-01")],
    );
    expect(r!.stats.totalSpent).toBe(1500);
    expect(r!.stats.purchases).toBe(5);
  });

  it("🔴 el ticket promedio se recalcula sobre el total combinado", () => {
    const [r] = fusionarMetricasAlegra(
      [fila("c1", 1000, 2, null)], // promedio del sistema: 500
      [alegra("c1", 500, 3, "2026-09-01")],
    );
    // 1500 / 5 = 300. Arrastrar el 500 del sistema sería un promedio que no
    // corresponde a ninguna de las dos mitades.
    expect(r!.stats.avgTicket).toBe(300);
  });

  it("🔴 la última visita es la MÁS RECIENTE de las dos fuentes", () => {
    const [nuevaEnAlegra] = fusionarMetricasAlegra(
      [fila("c1", 100, 1, "2026-01-01T09:00")],
      [alegra("c1", 50, 1, "2026-09-05")],
    );
    expect(nuevaEnAlegra!.stats.lastVisitAt).toBe("2026-09-05");

    const [nuevaEnSistema] = fusionarMetricasAlegra(
      [fila("c1", 100, 1, "2026-09-06T09:00")],
      [alegra("c1", 50, 1, "2026-09-05")],
    );
    expect(nuevaEnSistema!.stats.lastVisitAt).toBe("2026-09-06T09:00");
  });

  it("🔴 una venta del sistema del MISMO día no se pisa por tener más precisión", () => {
    // «2026-09-05T14:00» > «2026-09-05» como texto, que es justo lo que se
    // quiere: la del sistema es más reciente dentro del mismo día.
    const [r] = fusionarMetricasAlegra(
      [fila("c1", 100, 1, "2026-09-05T14:00")],
      [alegra("c1", 50, 1, "2026-09-05")],
    );
    expect(r!.stats.lastVisitAt).toBe("2026-09-05T14:00");
  });

  it("un cliente sin histórico migrado se devuelve intacto", () => {
    const original = fila("c2", 700, 3, "2026-09-01T08:00");
    const [r] = fusionarMetricasAlegra([original], [alegra("c1", 500, 3, "2026-09-01")]);
    expect(r).toBe(original);
  });

  it("sin histórico, la lista se devuelve tal cual (misma referencia)", () => {
    const filas = [fila("c1", 700, 3, null)];
    expect(fusionarMetricasAlegra(filas, [])).toBe(filas);
  });
});
