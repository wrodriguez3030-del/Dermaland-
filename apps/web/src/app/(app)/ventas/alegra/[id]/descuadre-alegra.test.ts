import { describe, it, expect } from "vitest";
import { hayDescuadreAlegra } from "./descuadre-alegra";

/**
 * Valores REALES de producción (07/09), verificados con una consulta de
 * solo lectura contra `alegra_invoices`: con la fórmula correcta
 * (`subtotal - discount + itbis`) solo 36 de 14 730 facturas cerradas
 * desajustan por encima de 0.01 — el arrastre real de la migración. Sin
 * restar el `discount`, desajustaban 2654: exactamente las que tienen
 * descuento, un falso positivo, no un problema de datos.
 */
describe("hayDescuadreAlegra", () => {
  it("factura SIN descuento que cuadra exacto → false", () => {
    // f1a5bbab-298f-43da-9f55-f0946461cb10
    expect(
      hayDescuadreAlegra({ subtotal: 1080.51, discount: 0, itbis: 194.49, total: 1275.0 }),
    ).toBe(false);
  });

  it("factura CON descuento que cuadra exacto restando el descuento → false", () => {
    // 623a6b74-a565-4db0-bf99-710b5930dc3d — sin restar el descuento
    // desajustaba en 291.11, que es justo el descuento: falso positivo.
    expect(
      hayDescuadreAlegra({
        subtotal: 2911.02,
        discount: 291.1,
        itbis: 471.59,
        total: 3091.5,
      }),
    ).toBe(false);
  });

  it("factura B01 con descuento grande también cuadra → false", () => {
    // ed63e42b-bdca-405c-a432-a309183e371b
    expect(
      hayDescuadreAlegra({
        subtotal: 48750.0,
        discount: 11236.88,
        itbis: 0,
        total: 37513.13,
      }),
    ).toBe(false);
  });

  it("arrastre real de la migración (diferencia > 0.01 incluso restando el descuento) → true", () => {
    expect(
      hayDescuadreAlegra({ subtotal: 100, discount: 0, itbis: 18, total: 118.5 }),
    ).toBe(true);
  });

  it("diferencia de un centavo por redondeo (≤0.01) → false, no se alarma por nada", () => {
    expect(
      hayDescuadreAlegra({ subtotal: 100, discount: 0, itbis: 18, total: 118.01 }),
    ).toBe(false);
  });
});
