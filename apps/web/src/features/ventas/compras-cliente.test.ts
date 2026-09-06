import { describe, it, expect } from "vitest";
import type { Proforma } from "@/types";
import { combinarComprasCliente, resumenComprasCliente } from "./compras-cliente";
import type { VentaUnificada } from "./venta-unificada";

const proforma = (over: Partial<Proforma>): Proforma =>
  ({
    id: "p1",
    number: "PRO-1",
    createdAt: "2026-08-01T10:00:00Z",
    customerId: "c1",
    customerName: "Ana",
    total: 100,
    itbis: 0,
    subtotal: 100,
    status: "paid",
    branchId: "b1",
    items: [],
    payments: [],
    ...over,
  }) as unknown as Proforma;

const alegra = (over: Partial<VentaUnificada>): VentaUnificada => ({
  id: "a1",
  origen: "alegra",
  numero: "B0100000001",
  fecha: "2026-07-01",
  clienteId: "c1",
  clienteNombre: "Ana",
  total: 500,
  itbis: 0,
  subtotal: 500,
  formaPago: "cash",
  vendedor: null,
  sucursalId: null,
  anulada: false,
  editable: false,
  ...over,
});

describe("compras del cliente, sistema + Alegra", () => {
  it("las junta y las ordena por fecha, de la más reciente a la más antigua", () => {
    const filas = combinarComprasCliente(
      [proforma({ id: "p1", createdAt: "2026-08-01T10:00:00Z" })],
      [alegra({ id: "a1", fecha: "2026-09-01" }), alegra({ id: "a2", fecha: "2026-01-01" })],
    );
    expect(filas.map((f) => f.venta.id)).toEqual(["a1", "p1", "a2"]);
  });

  it("una compra de Alegra nunca llega editable ni con proforma que abrir", () => {
    const [fila] = combinarComprasCliente([], [alegra({})]);
    expect(fila!.proforma).toBeNull();
    expect(fila!.venta.editable).toBe(false);
  });

  it("una compra del sistema conserva su proforma (es la que abre e imprime)", () => {
    const [fila] = combinarComprasCliente([proforma({ id: "p9" })], []);
    expect(fila!.proforma?.id).toBe("p9");
    expect(fila!.venta.editable).toBe(true);
  });

  it("🔴 las ventas del sistema que también vengan por la API no se duplican", () => {
    // `/api/ventas` devuelve las DOS fuentes. Si se aceptaran sus filas del
    // sistema junto a las proformas locales, cada compra se contaría dos veces
    // y el total del cliente saldría al doble.
    const filas = combinarComprasCliente(
      [proforma({ id: "p1", total: 100 })],
      [{ ...alegra({ id: "p1", total: 100 }), origen: "sistema" }],
    );
    expect(filas).toHaveLength(1);
    expect(resumenComprasCliente(filas).total).toBe(100);
  });

  it("una factura migrada con el mismo id que otra no se repite", () => {
    const filas = combinarComprasCliente([], [alegra({ id: "a1" }), alegra({ id: "a1" })]);
    expect(filas).toHaveLength(1);
  });
});

describe("resumen de compras del cliente", () => {
  it("dice cuántas puso cada fuente y suma las dos", () => {
    const filas = combinarComprasCliente([proforma({ total: 100 })], [alegra({ total: 500 })]);
    const r = resumenComprasCliente(filas);
    expect(r.cantidadSistema).toBe(1);
    expect(r.cantidadAlegra).toBe(1);
    expect(r.total).toBe(600);
  });

  it("🔴 una compra anulada no suma ni cuenta", () => {
    // Mismo criterio que el resto del plan: existe para auditarla, no para
    // contarla como gasto del cliente.
    const filas = combinarComprasCliente([], [alegra({ total: 500, anulada: true })]);
    const r = resumenComprasCliente(filas);
    expect(r.total).toBe(0);
    expect(r.cantidadAlegra).toBe(0);
    // Pero la fila SIGUE en la lista: se ve, tachada.
    expect(filas).toHaveLength(1);
  });
});
