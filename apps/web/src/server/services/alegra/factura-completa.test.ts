import { describe, it, expect, vi } from "vitest";
import { facturaAlegraCompleta } from "./factura-completa";

/**
 * Cliente de mentira, mismo estilo que `ventas-unificadas.test.ts`. Dos tablas
 * con forma distinta:
 *  - `alegra_invoices` (cabecera) termina en `.maybeSingle()`: una fila o nada.
 *  - `alegra_invoice_items` (líneas) es el builder encadenable de siempre, con
 *    `.then` al final — se pide con `.range()`, no con `.maybeSingle()`.
 *
 * `eqCabecera` y `rangeLineas` son los espías que dejan asertar QUÉ se le
 * pidió a cada tabla (filtro de tenant en la cabecera, tope en las líneas),
 * sin tener que enumerar las filas del falso.
 */
function clienteFalso(cabecera: unknown | null, lineas: unknown[]) {
  const eqCabecera = vi.fn();
  const rangeLineas = vi.fn();
  const from = vi.fn((tabla: string) => {
    if (tabla === "alegra_invoices") {
      const q: Record<string, unknown> = {};
      q.select = vi.fn(() => q);
      q.eq = vi.fn((...args: unknown[]) => {
        eqCabecera(...args);
        return q;
      });
      q.maybeSingle = vi.fn(async () => ({ data: cabecera, error: null }));
      return q;
    }
    const q: Record<string, unknown> = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.range = vi.fn((...args: unknown[]) => {
      rangeLineas(...args);
      return q;
    });
    q.then = (resolve: (v: unknown) => void) => resolve({ data: lineas, error: null });
    return q;
  });
  return { from, eqCabecera, rangeLineas };
}

describe("factura completa de Alegra", () => {
  it("devuelve null si la factura no existe (o no es de este negocio)", async () => {
    const c = clienteFalso(null, []);
    const r = await facturaAlegraCompleta({ businessId: "b1", cliente: c }, "f-1");
    expect(r).toBeNull();
  });

  it("filtra la cabecera por business_id Y por id: nunca solo por id", async () => {
    const c = clienteFalso(null, []);
    await facturaAlegraCompleta({ businessId: "b1", cliente: c }, "f-1");
    expect(c.eqCabecera).toHaveBeenCalledWith("business_id", "b1");
    expect(c.eqCabecera).toHaveBeenCalledWith("id", "f-1");
  });

  it("devuelve cabecera + líneas ordenadas por line_no, con los `numeric` ya convertidos", async () => {
    const cabecera = {
      id: "f-1",
      ncf: "B0200000001",
      ncf_prefix: "B02",
      date: "2026-08-01",
      issued_at: "2026-08-01T10:00:00Z",
      status: "closed",
      client_id: "cli-1",
      client_name: "Ana Pérez",
      client_document: "00112223334",
      branch_id: "suc-1",
      seller_name: "Juan",
      payment_method: "cash",
      subtotal: "1000.00",
      discount: "0.00",
      itbis: "180.00",
      total: "1180.00",
    };
    const lineas = [
      {
        line_no: 1,
        product_id: "p-1",
        name: "Crema A",
        quantity: "2",
        unit_price: "295.00",
        discount: "0.00",
        itbis: "90.00",
        total: "590.00",
      },
      {
        line_no: 2,
        product_id: "p-2",
        name: "Crema B",
        quantity: "1",
        unit_price: "590.00",
        discount: "0.00",
        itbis: "90.00",
        total: "590.00",
      },
    ];
    const c = clienteFalso(cabecera, lineas);
    const r = await facturaAlegraCompleta({ businessId: "b1", cliente: c }, "f-1");

    expect(r).not.toBeNull();
    expect(r!.id).toBe("f-1");
    expect(r!.ncfPrefix).toBe("B02");
    expect(r!.clientName).toBe("Ana Pérez");
    // Los `numeric` de PostgREST llegan como cadena; nunca deben salir como tal.
    expect(r!.subtotal).toBe(1000);
    expect(r!.itbis).toBe(180);
    expect(r!.total).toBe(1180);
    expect(r!.lineas).toHaveLength(2);
    // El orden lo pone la base (`.order("line_no")`); esto solo comprueba que
    // el mapeo no lo revuelve.
    expect(r!.lineas.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(r!.lineas[0]!.unitPrice).toBe(295);
    expect(r!.lineas[0]!.quantity).toBe(2);
  });

  it("🔴 la consulta de líneas lleva `.range(0, 999)`: sin tope, PostgREST corta en 1000 EN SILENCIO", async () => {
    const cabecera = {
      id: "f-1",
      ncf: null,
      ncf_prefix: null,
      date: "2026-08-01",
      issued_at: null,
      status: "open",
      client_id: null,
      client_name: null,
      client_document: null,
      branch_id: null,
      seller_name: null,
      payment_method: null,
      subtotal: "0",
      discount: "0",
      itbis: "0",
      total: "0",
    };
    const c = clienteFalso(cabecera, []);
    await facturaAlegraCompleta({ businessId: "b1", cliente: c }, "f-1");
    expect(c.rangeLineas).toHaveBeenCalledWith(0, 999);
  });
});
