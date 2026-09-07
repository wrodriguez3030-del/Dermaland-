import { describe, it, expect } from "vitest";
import type { Proforma } from "@/types";
import { combinarComprasCliente, metricasComprasCliente, textoComprasCliente } from "./compras-cliente";
import type { VentaUnificada } from "./venta-unificada";

const proforma = (over: Partial<Proforma>): Proforma =>
  ({
    id: "p1",
    number: "PRO-1",
    createdAt: "2026-08-01T10:00:00Z",
    customerId: "c1",
    customerName: "Ana",
    total: 100,
    paid: 100,
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
  estado: "vigente",
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
    expect(metricasComprasCliente(filas).totalGastado).toBe(100);
  });

  it("una factura migrada con el mismo id que otra no se repite", () => {
    const filas = combinarComprasCliente([], [alegra({ id: "a1" }), alegra({ id: "a1" })]);
    expect(filas).toHaveLength(1);
  });
});

describe("🔴 una sola definición de «lo que este cliente ha comprado»", () => {
  // El fallo que esto cierra: el KPI decía «Total gastado RD$0.00 · Compras 0»
  // a diez centímetros de «Compras (172) · RD$X comprados». Dos números con el
  // mismo nombre y significados distintos, en la misma pantalla.
  it("suma las dos fuentes y dice cuántas pone cada una", () => {
    const filas = combinarComprasCliente(
      [proforma({ total: 100, status: "paid" })],
      [alegra({ total: 500 })],
    );
    const m = metricasComprasCliente(filas);
    expect(m.cantidadSistema).toBe(1);
    expect(m.cantidadAlegra).toBe(1);
    expect(m.compras).toBe(2);
    expect(m.totalGastado).toBe(600);
  });

  it("🔴 una compra anulada no suma ni cuenta, pero se sigue listando", () => {
    const filas = combinarComprasCliente([], [alegra({ total: 500, anulada: true })]);
    const m = metricasComprasCliente(filas);
    expect(m.totalGastado).toBe(0);
    expect(m.cantidadAlegra).toBe(0);
    expect(m.listadas).toBe(1);
  });

  it("🔴 usa la regla de la casa para el sistema: una proforma sin cobrar NO es gasto", () => {
    // `isFinalCustomerTransaction`. Si aquí se contara `total` a secas, el KPI
    // diría que el cliente gastó RD$5 000 que todavía no ha pagado.
    const filas = combinarComprasCliente([proforma({ total: 5000, status: "issued" })], []);
    const m = metricasComprasCliente(filas);
    expect(m.totalGastado).toBe(0);
    expect(m.compras).toBe(0);
    expect(m.listadas).toBe(1);
  });

  it("🔴 en una parcial cuenta lo PAGADO, no lo facturado", () => {
    const filas = combinarComprasCliente(
      [proforma({ total: 5000, paid: 1200, status: "partially_paid" })],
      [],
    );
    expect(metricasComprasCliente(filas).totalGastado).toBe(1200);
  });

  it("🔴 una proforma convertida en factura no se cuenta dos veces", () => {
    const filas = combinarComprasCliente(
      [
        proforma({ id: "origen", total: 3000, status: "paid" }),
        proforma({ id: "final", total: 3000, status: "paid", sourceProformaId: "origen" }),
      ],
      [],
    );
    const m = metricasComprasCliente(filas);
    expect(m.totalGastado).toBe(3000);
    expect(m.compras).toBe(1);
  });

  it("la última compra mira las dos fuentes", () => {
    // Sin esto, «Última visita» decía «—» en la ficha de alguien con 172
    // compras migradas.
    const filas = combinarComprasCliente([], [alegra({ fecha: "2026-09-01" })]);
    expect(metricasComprasCliente(filas).ultimaCompra).toBe("2026-09-01");
  });

  it("la leyenda avisa cuando la tabla lista filas que no cuentan como gasto", () => {
    const filas = combinarComprasCliente(
      [proforma({ total: 5000, status: "issued" })],
      [alegra({ total: 500 })],
    );
    const texto = textoComprasCliente(metricasComprasCliente(filas));
    expect(texto).toMatch(/no cuentan como gasto/);
  });

  it("🔴 con todo excluido y todo migrado, la leyenda NO se lo cuelga al sistema", () => {
    // Alcanzable hoy: un cliente cuya única factura migrada esté anulada. La
    // frase decía «0 compras del sistema» con la etiqueta «Migrada de Alegra»
    // visible dos centímetros más abajo, contradiciéndola. La mutación que
    // esto mata: volver a hablar del sistema cuando `m.compras === 0`.
    const filas = combinarComprasCliente([], [alegra({ anulada: true, estado: "anulada" })]);
    const texto = textoComprasCliente(metricasComprasCliente(filas));
    expect(texto).not.toMatch(/del sistema/);
    expect(texto).toMatch(/migradas de Alegra/);
    expect(texto).toMatch(/Ninguna de las 1 compras? listadas cuenta como gasto/);
  });

  it("y si lo excluido es todo del sistema, tampoco se lo cuelga a Alegra", () => {
    const filas = combinarComprasCliente([proforma({ status: "cancelled" })], []);
    const texto = textoComprasCliente(metricasComprasCliente(filas));
    expect(texto).toMatch(/todas del sistema/);
    expect(texto).not.toMatch(/migradas de Alegra/);
  });

  it("con las dos fuentes excluidas, dice cuántas pone cada una", () => {
    const filas = combinarComprasCliente(
      [proforma({ status: "cancelled" })],
      [alegra({ anulada: true, estado: "anulada" })],
    );
    expect(textoComprasCliente(metricasComprasCliente(filas))).toMatch(
      /1 del sistema, 1 migradas de Alegra/,
    );
  });

  it("la leyenda habla de compras, no de «ventas» ni de «período»", () => {
    // Esta pantalla no tiene filtro de fechas y la tabla se titula «Compras».
    const filas = combinarComprasCliente([], [alegra({}), alegra({ id: "a2" })]);
    const texto = textoComprasCliente(metricasComprasCliente(filas));
    expect(texto).toMatch(/compras/);
    expect(texto).not.toMatch(/ventas|período/);
  });
});
