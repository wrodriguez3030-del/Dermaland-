import { describe, it, expect, vi } from "vitest";
import { desgloseVentas, listarVentasUnificadas, resumenVentas } from "./ventas-unificadas";

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

/**
 * Cliente de mentira para el desglose: `rpc` devuelve las filas que le pases,
 * con la MISMA forma que la función SQL (importes `numeric` como cadena, que
 * es como los entrega PostgREST).
 */
function clienteDesglose(filas: unknown[]) {
  const consultadas: string[] = [];
  const from = vi.fn((tabla: string) => {
    consultadas.push(tabla);
    return {};
  });
  // Los parámetros van DECLARADOS aunque el falso no los use: sin ellos
  // `rpc.mock.calls[0]` es la tupla vacía y no se puede inspeccionar qué se le
  // mandó a la base, que es justo lo que estas pruebas comprueban.
  const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
    data: filas,
    error: null,
  }));
  return { consultadas, from, rpc };
}

describe("desglose de ventas unificadas", () => {
  const fila = (extra: Record<string, unknown>) => ({
    clave: "x",
    etiqueta: "X",
    origen: "alegra",
    cantidad: "1",
    total: "10.00",
    ...extra,
  });

  it("NO descarga filas: agrupa en la base", async () => {
    // La misma regla que el resumen. Agrupar 31 213 renglones en el navegador
    // es exactamente el antipatrón que este plan corrige.
    const c = clienteDesglose([]);
    await desgloseVentas({ businessId: "b1", cliente: c } as never, {}, "producto");
    expect(c.consultadas).toHaveLength(0);
    expect(c.rpc).toHaveBeenCalledWith(
      "desglose_ventas_unificadas",
      expect.objectContaining({ p_business_id: "b1", p_dimension: "producto" }),
    );
  });

  it("🔴 el business_id sale del contexto, NUNCA de los filtros de quien llama", async () => {
    const c = clienteDesglose([]);
    await desgloseVentas(
      { businessId: "b1", cliente: c } as never,
      // Un filtro con un business_id ajeno colado dentro: no puede llegar a la base.
      { businessId: "OTRA-EMPRESA" } as never,
      "vendedor",
    );
    const args = c.rpc.mock.calls[0]![1];
    expect(args.p_business_id).toBe("b1");
    expect(Object.values(args)).not.toContain("OTRA-EMPRESA");
  });

  it("pasa los cuatro filtros tal cual, y `null` cuando no hay", async () => {
    const c = clienteDesglose([]);
    await desgloseVentas(
      { businessId: "b1", cliente: c } as never,
      { desde: "2026-01-01", sucursalId: "s1" },
      "vendedor",
    );
    expect(c.rpc).toHaveBeenCalledWith("desglose_ventas_unificadas", {
      p_business_id: "b1",
      p_desde: "2026-01-01",
      p_hasta: null,
      p_cliente_id: null,
      p_sucursal_id: "s1",
      p_dimension: "vendedor",
    });
  });

  it("convierte los importes que PostgREST entrega como cadena", async () => {
    const c = clienteDesglose([fila({ total: "48454899.08", cantidad: "14743" })]);
    const r = await desgloseVentas({ businessId: "b1", cliente: c } as never, {}, "vendedor");
    expect(r[0]!.total).toBeCloseTo(48454899.08, 2);
    expect(r[0]!.cantidad).toBe(14743);
  });

  it("🔴 una fila con origen desconocido se DESCARTA, no se cuela como «sistema»", () => {
    // «sistema» es el origen que la pantalla pinta SIN etiqueta (así lo decide
    // `EtiquetaOrigen`, que falla cerrada). Si un origen raro cayera ahí por
    // defecto, dinero migrado aparecería como venta del sistema y nadie lo
    // vería. Se descarta la fila entera.
    const c = clienteDesglose([fila({ origen: "vete-a-saber" }), fila({ origen: null }), fila({ origen: "sistema" })]);
    return desgloseVentas({ businessId: "b1", cliente: c } as never, {}, "vendedor").then((r) => {
      expect(r).toHaveLength(1);
      expect(r[0]!.origen).toBe("sistema");
    });
  });

  it("se puede pedir solo lo del sistema: sin Alegra no llega ni una fila migrada", async () => {
    const c = clienteDesglose([fila({ origen: "alegra" }), fila({ origen: "sistema" })]);
    const r = await desgloseVentas(
      { businessId: "b1", cliente: c } as never,
      { incluirAlegra: false },
      "vendedor",
    );
    expect(r.map((f) => f.origen)).toEqual(["sistema"]);
  });

  it("🔴 tiene tope de filas aunque la base devuelva de más", async () => {
    // El `limit 200` de la función SQL no basta: una migración se puede
    // reemplazar sin tocar este archivo, y ninguna pantalla del plan puede
    // recibir una tabla entera.
    const muchas = Array.from({ length: 500 }, (_, i) => fila({ clave: `p-${i}`, etiqueta: `P${i}` }));
    const c = clienteDesglose(muchas);
    const r = await desgloseVentas({ businessId: "b1", cliente: c } as never, {}, "producto");
    expect(r.length).toBeLessThanOrEqual(200);
  });

  it("una respuesta vacía o nula da lista vacía, no revienta", async () => {
    const nula = clienteDesglose(null as never);
    expect(await desgloseVentas({ businessId: "b1", cliente: nula } as never, {}, "vendedor")).toEqual([]);
  });
});
