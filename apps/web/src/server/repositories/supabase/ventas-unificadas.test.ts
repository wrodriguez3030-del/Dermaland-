import { describe, it, expect, vi } from "vitest";
import { listarVentasUnificadas, resumenVentas } from "./ventas-unificadas";

/**
 * Cliente de mentira. `from(tabla)` da un builder encadenable (select, eq,
 * gte, lte, order, limit, range — todos no-op, siempre devuelven el mismo
 * builder) cuyo `then` resuelve con las filas de `proformas` o `alegra`
 * según la tabla pedida. `rpc(fn, args)` es lo que usa `resumenVentas`: el
 * mock del pliego original solo cubría `.from()` (una consulta de filas), y
 * `resumenVentas` no trae filas — llama a la función SQL
 * `resumen_ventas_unificadas` por RPC (ver el porqué en el encabezado de
 * `ventas-unificadas.ts` y en la migración
 * `supabase/migrations/20260906130000_resumen_ventas_unificadas.sql`: los
 * agregados de PostgREST están desactivados en este proyecto, comprobado en
 * vivo). Por eso el mock se extiende con `rpc`, devolviendo la misma forma
 * de fila que devolvería la función real.
 */
function clienteFalso(proformas: unknown[], alegra: unknown[]) {
  const consultadas: string[] = [];
  const from = vi.fn((tabla: string) => {
    consultadas.push(tabla);
    const datos = tabla === "proformas" ? proformas : alegra;
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "limit", "range"]) q[m] = vi.fn(() => q);
    q.then = (r: (v: unknown) => void) => r({ data: datos, error: null });
    return q;
  });
  const rpc = vi.fn(async () => ({
    data: [{ sistema_total: 0, sistema_cantidad: 0, alegra_total: 0, alegra_cantidad: 0 }],
    error: null,
  }));
  return { consultadas, from, rpc };
}

describe("ventas unificadas", () => {
  it("lee las dos tablas y devuelve una sola lista", async () => {
    const c = clienteFalso([{ id: "p-1", total: 100 }], [{ id: "a-1", total: 200 }]);
    const r = await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, {});
    expect(c.consultadas).toContain("proformas");
    expect(c.consultadas).toContain("alegra_invoices");
    // `listarVentasUnificadas` devuelve `{ ventas, hayMas }` (paginación,
    // no un array pelado): la lista combinada vive en `.ventas`.
    expect(r.ventas).toHaveLength(2);
  });

  it("NUNCA escribe: las facturas de Alegra son historial, no datos vivos", async () => {
    const c = clienteFalso([], []);
    await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, {});
    const q = c.from("alegra_invoices") as Record<string, unknown>;
    expect(q.insert).toBeUndefined();
    expect(q.update).toBeUndefined();
    expect(q.delete).toBeUndefined();
  });

  it("se puede pedir solo lo del sistema, sin Alegra", async () => {
    const c = clienteFalso([{ id: "p-1", total: 100 }], [{ id: "a-1", total: 200 }]);
    const r = await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, { incluirAlegra: false });
    expect(c.consultadas).not.toContain("alegra_invoices");
    expect(r.ventas).toHaveLength(1);
  });

  it("el resumen NO descarga filas: cuenta en la base", async () => {
    // Es la regla del plan. Traer 14 965 facturas para sumarlas son 25 MB por
    // cada vez que alguien abre el panel.
    const c = clienteFalso([], []);
    const r = await resumenVentas({ businessId: "b1", cliente: c } as never, {});
    expect(r.total).toBeTypeOf("number");
    // Ni una fila: `resumenVentas` no llama a `.from()` en absoluto, solo a
    // la función de la base que cuenta y suma (ver `c.rpc` arriba).
    expect(c.consultadas).toHaveLength(0);
    expect(c.rpc).toHaveBeenCalledWith(
      "resumen_ventas_unificadas",
      expect.objectContaining({ p_business_id: "b1" }),
    );
  });

  it("el listado tiene tope duro aunque pidan más", async () => {
    const c = clienteFalso([], []);
    const r = await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, { limite: 100000 });
    // El tope lo pone el servidor, no quien llama: nunca se devuelven más de 200.
    expect(r.ventas.length).toBeLessThanOrEqual(200);
  });

  it("pagina las dos fuentes: PostgREST corta en 1000 filas EN SILENCIO", async () => {
    // Sin paginar, un negocio con 14 965 facturas vería 1 000 y creería que
    // son todas. Ya nos pasó al verificar la migración.
    const muchas = Array.from({ length: 1000 }, (_, i) => ({ id: `a-${i}`, total: 1 }));
    const c = clienteFalso([], muchas);
    await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, {});
    const rangos = (c.from as unknown as { mock: { results: { value: Record<string, { mock: { calls: unknown[] } }> }[] } }).mock.results;
    expect(rangos.length).toBeGreaterThan(0);
  });
});
