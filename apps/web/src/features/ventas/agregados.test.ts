import { describe, it, expect } from "vitest";
import { totalVendido, contarVentas, porOrigen, porFormaPago, porVendedor, enRango } from "./agregados";
import type { VentaUnificada } from "./venta-unificada";

const v = (over: Partial<VentaUnificada>): VentaUnificada => ({
  id: "x", origen: "alegra", numero: "B01", fecha: "2026-08-01T00:00:00Z",
  clienteId: null, clienteNombre: null, total: 100, itbis: 0, subtotal: 100,
  formaPago: null, vendedor: null, sucursalId: null, anulada: false, editable: false,
  ...over,
});

describe("agregados de ventas", () => {
  it("las anuladas NO suman", () => {
    // Es la regla que ya aplica el módulo de reportes de Alegra: una factura
    // anulada existe para auditarla, no para contarla como ingreso.
    const total = totalVendido([v({ total: 100 }), v({ total: 500, anulada: true })]);
    expect(total).toBe(100);
  });

  it("las anuladas tampoco cuentan como ventas", () => {
    expect(contarVentas([v({}), v({ anulada: true })])).toBe(1);
  });

  it("el desglose por origen deja ver de dónde sale cada peso", () => {
    // Sin esto, un total que mezcla dos fuentes no se puede auditar.
    const d = porOrigen([v({ total: 100 }), v({ total: 50, origen: "sistema" })]);
    expect(d.alegra.total).toBe(100);
    expect(d.sistema.total).toBe(50);
    expect(d.alegra.cantidad).toBe(1);
  });

  it("el desglose por origen no omite la fuente sin ventas: da cero, no undefined", () => {
    const d = porOrigen([v({ origen: "alegra", total: 100 })]);
    expect(d.sistema).toEqual({ total: 0, cantidad: 0 });
  });

  it("una anulada tampoco entra en el desglose por origen", () => {
    const d = porOrigen([v({ origen: "alegra", total: 999, anulada: true })]);
    expect(d.alegra).toEqual({ total: 0, cantidad: 0 });
  });

  it("el rango de fechas incluye los extremos", () => {
    const ventas = [v({ fecha: "2026-08-01T00:00:00Z" }), v({ fecha: "2026-08-31T23:59:00Z" }), v({ fecha: "2026-09-01T00:00:00Z" })];
    expect(enRango(ventas, "2026-08-01", "2026-08-31")).toHaveLength(2);
  });

  it("el total de las dos fuentes es la suma de las dos, sin perder céntimos", () => {
    // Los importes vienen de numeric(14,2); sumarlos como flotantes acumula error.
    const ventas = Array.from({ length: 3 }, () => v({ total: 0.1 }));
    expect(totalVendido(ventas)).toBeCloseTo(0.3, 2);
  });

  it("la suma no arrastra error de flotantes ni a la escala real migrada", () => {
    // 14 743 facturas reales (las no anuladas migradas de Alegra) suman
    // ~48 millones: es la escala donde el error de sumar flotantes uno a
    // uno se nota. Sumando en centavos enteros la igualdad es exacta, no
    // solo "cercana": 14 743 × 33.33 = 491 384.19 sin desviación.
    const ventas = Array.from({ length: 14743 }, () => v({ total: 33.33 }));
    expect(totalVendido(ventas)).toBe(491384.19);
  });

  it("por forma de pago suma y ordena de mayor a menor, sin las anuladas", () => {
    const ventas = [
      v({ formaPago: "cash", total: 100 }),
      v({ formaPago: "cash", total: 500, anulada: true }),
      v({ formaPago: "transfer", total: 300 }),
      v({ formaPago: null, total: 40 }),
    ];
    const d = porFormaPago(ventas);
    expect(d).toEqual([
      { clave: "transfer", etiqueta: "transfer", cantidad: 1, total: 300 },
      { clave: "cash", etiqueta: "cash", cantidad: 1, total: 100 },
      { clave: "", etiqueta: "Sin forma de pago", cantidad: 1, total: 40 },
    ]);
  });

  it("por vendedor suma y ordena de mayor a menor, sin las anuladas ni las de otro vendedor", () => {
    const ventas = [
      v({ vendedor: "Ana", total: 50 }),
      v({ vendedor: "Ana", total: 30 }),
      v({ vendedor: "Luis", total: 200, anulada: true }),
      v({ vendedor: null, total: 10 }),
    ];
    const d = porVendedor(ventas);
    expect(d[0]).toMatchObject({ etiqueta: "Ana", cantidad: 2, total: 80 });
    expect(d.find((g) => g.etiqueta === "Sin vendedor")).toMatchObject({ total: 10 });
    expect(d.find((g) => g.etiqueta === "Luis")).toBeUndefined();
  });
});
