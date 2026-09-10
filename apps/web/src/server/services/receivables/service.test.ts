import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cuentas por cobrar con el histórico migrado dentro.
 *
 * Lo que se prueba aquí es de dinero: que los saldos de Alegra entren en el
 * total de lo que se debe, que se vean marcados, y que NADIE pueda aplicarles
 * un pago desde DermaLand — porque ese pago quedaría aquí y no en Alegra, y
 * los dos sistemas dejarían de cuadrar.
 */

/** Filas por tabla que devuelve el cliente falso. */
const tablas: Record<string, { data?: unknown[]; count?: number }> = {};
const rpcLlamado = vi.fn();
/** Argumentos de cada `.in(columna, valores)` que se ejecutó, por tabla. */
const filtrosIn: { tabla: string; columna: string; valores: unknown[] }[] = [];

type Fila = Record<string, unknown>;
type Filtro = { tipo: "eq" | "in"; columna: string; valor: unknown };

/**
 * El falso APLICA `eq` e `in` sobre las columnas que la fila trae.
 *
 * 🔴 Antes no lo hacía —todos los métodos eran `vi.fn(() => q)`— y eso dejaba
 * pasar una mutación que apagaba TODOS los cobros del sistema: borrar el
 * `.in("id", ids)` del guard hacía que la consulta devolviera las 14 965
 * facturas migradas del negocio y que cualquier cobro muriera con el mensaje
 * de Alegra. Un falso que ignora los filtros no puede probar un filtro.
 *
 * Las columnas que la fila NO modela (p. ej. `business_id` en las filas
 * mínimas de estas pruebas) no filtran: el falso solo sabe de lo que le dan.
 */
function aplicaFiltros(filas: unknown[], filtros: Filtro[]): unknown[] {
  return filas.filter((cruda) => {
    const fila = cruda as Fila;
    return filtros.every((f) => {
      if (!(f.columna in fila)) return true;
      if (f.tipo === "eq") return fila[f.columna] === f.valor;
      return Array.isArray(f.valor) && f.valor.includes(fila[f.columna]);
    });
  });
}

/**
 * Builder encadenable que recuerda sus filtros y los aplica al resolver.
 *
 * 🔴 `.range(from, to)` RECORTA de verdad, y sin `.range()` la respuesta se
 * corta en `TOPE_POSTGREST` filas — igual que PostgREST, que trunca en 1 000 EN
 * SILENCIO. Un falso que devuelve siempre todo no puede probar una paginación:
 * la consulta sin paginar pasaría la prueba y en producción escondería deuda.
 */
const TOPE_POSTGREST = 1000;

function consulta(tabla: string) {
  const filtros: Filtro[] = [];
  let rango: { from: number; to: number } | null = null;
  const q: Record<string, unknown> = {};
  for (const m of ["select", "gt", "gte", "lte", "lt", "not", "order", "limit", "maybeSingle"]) {
    q[m] = vi.fn(() => q);
  }
  q.range = vi.fn((from: number, to: number) => {
    rango = { from, to };
    return q;
  });
  q.eq = vi.fn((columna: string, valor: unknown) => {
    filtros.push({ tipo: "eq", columna, valor });
    return q;
  });
  q.in = vi.fn((columna: string, valores: unknown[]) => {
    filtrosIn.push({ tabla, columna, valores });
    filtros.push({ tipo: "in", columna, valor: valores });
    return q;
  });
  q.then = (r: (v: unknown) => void) => {
    const todas = aplicaFiltros(tablas[tabla]?.data ?? [], filtros);
    const rangoActual: { from: number; to: number } | null = rango;
    const filas = rangoActual
      ? todas.slice(rangoActual.from, Math.min(rangoActual.to + 1, rangoActual.from + TOPE_POSTGREST))
      : todas.slice(0, TOPE_POSTGREST);
    r({ data: filas, error: null, count: tablas[tabla]?.count ?? todas.length });
  };
  return q;
}

/** Lo que devuelve el RPC `ar_apply_payments`: cada prueba lo puede fijar. */
let rpcRespuesta: { data: unknown; error: { message: string } | null } = { data: [], error: null };

vi.mock("@/server/repositories/supabase/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/repositories/supabase/client")>()),
  getClient: async () => ({
    from: (tabla: string) => consulta(tabla),
    rpc: (...args: unknown[]) => {
      rpcLlamado(...args);
      return Promise.resolve(rpcRespuesta);
    },
  }),
}));

vi.mock("@/server/services/alegra/queries", () => ({
  facturasConSaldo: async () => facturasAlegra,
}));

/** Ventas para las que se generaron incentivos tras un cobro: (businessId, saleId). */
const generarIncentivos = vi.fn(async (_businessId: string, _saleId: string) => ({ generated: 0 }));
vi.mock("@/server/services/incentives/incentive-admin", () => ({
  generateIncentivesForSaleServer: (businessId: string, saleId: string) =>
    generarIncentivos(businessId, saleId),
}));

let facturasAlegra: unknown[] = [];

import { collect, listPending, summary, MOTIVO_ALEGRA_NO_COBRABLE } from "./service";

const ctx = { businessId: "b1", userId: "u1", userName: "Rosa" } as never;

const facturaAlegra = (over: Record<string, unknown> = {}) => ({
  id: ID_ALEGRA,
  ncf: "B0100000123",
  date: "2025-01-09",
  status: "open",
  clientId: "c1",
  clientName: "Ana",
  branchId: null,
  sellerName: "Laura Mejía",
  paymentMethod: "cash",
  subtotal: 1000,
  itbis: 0,
  total: 1000,
  totalPaid: 400,
  balance: 600,
  ...over,
});

const ID_ALEGRA = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k];
  facturasAlegra = [];
  filtrosIn.length = 0;
  rpcLlamado.mockClear();
  rpcRespuesta = { data: [], error: null };
  generarIncentivos.mockClear();
});

describe("facturas pendientes: sistema + Alegra", () => {
  it("los saldos de Alegra entran en la lista, marcados y sin poder cobrarse", async () => {
    facturasAlegra = [facturaAlegra()];
    const filas = await listPending(ctx);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.origen).toBe("alegra");
    expect(filas[0]!.balance).toBe(600);
    // 🔴 Lo importante: no se cobra, y el motivo viaja con la fila para que la
    // pantalla pueda enseñarlo. Un botón apagado sin explicación no explica.
    expect(filas[0]!.cobrable).toBe(false);
    expect(filas[0]!.motivoNoCobrable).toBe(MOTIVO_ALEGRA_NO_COBRABLE);
    expect(filas[0]!.motivoNoCobrable).toMatch(/cuadrar/);
  });

  it("una venta del sistema sí se cobra y no arrastra motivo", async () => {
    tablas.proformas = {
      data: [
        {
          id: "p1",
          number: "FAC-1",
          customer_name: "Ana",
          branch_id: "b",
          cashier_name: "Rosa",
          created_at: "2026-09-01T00:00:00Z",
          due_date: "2026-09-30",
          total: 100,
          paid: 0,
          balance: 100,
          status: "issued",
        },
      ],
    };
    const filas = await listPending(ctx);
    expect(filas[0]!.origen).toBe("sistema");
    expect(filas[0]!.cobrable).toBe(true);
    expect(filas[0]!.motivoNoCobrable).toBeNull();
  });

  it("🔴 una BORRADOR con saldo NO entra en lo que se debe", async () => {
    // Si entrara, `/cuentas-por-cobrar` diría «21 facturas migradas» y
    // `/cuentas-por-cobrar/alegra` diría 20: dos cifras de lo que se debe en el
    // mismo módulo, sin ninguna pista de cuál manda. Es el criterio de la casa
    // (`cuentaParaTotales`), el mismo que usan esa pantalla y la función SQL
    // del resumen de ventas. Hoy no hay ninguna borrador con saldo; por eso se
    // cierra ahora, mientras no duele.
    facturasAlegra = [
      facturaAlegra({ balance: 600 }),
      facturaAlegra({ id: "33333333-3333-3333-3333-333333333333", balance: 900, status: "draft" }),
    ];
    const filas = await listPending(ctx);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.balance).toBe(600);
  });

  it("🔴 y tampoco cuenta en el total del resumen", async () => {
    facturasAlegra = [
      facturaAlegra({ balance: 600 }),
      facturaAlegra({ id: "33333333-3333-3333-3333-333333333333", balance: 900, status: "draft" }),
    ];
    const s = await summary(ctx);
    expect(s.totalPendiente).toBe(600);
    expect(s.porOrigen.alegra).toEqual({ total: 600, facturas: 1 });
  });

  it("🔴 una factura vieja de Alegra con saldo NO se enseña como «al día»", async () => {
    // Alegra no guarda vencimiento. Dejar la fecha vacía las metía todas en el
    // tramo «al día» y el monto vencido salía en cero teniendo deuda de años.
    facturasAlegra = [facturaAlegra({ date: "2025-01-09" })];
    const filas = await listPending(ctx);
    expect(filas[0]!.dueDate).toBe("2025-01-09");
    expect(filas[0]!.overdueDays).toBeGreaterThan(60);
    expect(filas[0]!.bucket).toBe("v60");
  });
});

describe("🔴 la mitad del sistema PAGINA", () => {
  /** `n` proformas con saldo, todas del mismo negocio y el mismo vencimiento. */
  const muchasProformas = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${String(i).padStart(5, "0")}`,
      number: `FAC-${i}`,
      customer_name: "Ana",
      branch_id: "b",
      cashier_name: "Rosa",
      created_at: "2026-09-01T00:00:00Z",
      due_date: "2026-09-30",
      total: 10,
      paid: 0,
      balance: 10,
      status: "issued",
    }));

  it("🔴 con 1 001 proformas con saldo no se pierde ninguna", async () => {
    // La mutación que esto mata: quitar el `.range()`/`fetchAllPages` de la
    // consulta a `proformas`. PostgREST corta en 1 000 EN SILENCIO y de la
    // 1 001 en adelante desaparecen del total por cobrar, del aging, de la
    // mora, del calendario, del estado de cuenta y de los tres exports. Un
    // total de deuda que se corta callado es lo peor que puede pasar en esta
    // pantalla — y es literalmente lo que esta rama declaró que no quería.
    tablas.proformas = { data: muchasProformas(1001) };
    const filas = await listPending(ctx);
    expect(filas).toHaveLength(1001);
  });

  it("🔴 y el total por cobrar las suma TODAS", async () => {
    tablas.proformas = { data: muchasProformas(1001) };
    const s = await summary(ctx);
    expect(s.totalPendiente).toBe(10010);
    expect(s.facturasPendientes).toBe(1001);
    expect(s.porOrigen.sistema).toEqual({ total: 10010, facturas: 1001 });
  });

  it("no pide páginas de más cuando cabe todo en la primera", async () => {
    tablas.proformas = { data: muchasProformas(3) };
    expect(await listPending(ctx)).toHaveLength(3);
  });
});

describe("🔴 índice de recuperación: las dos mitades, la misma fuente", () => {
  const cobroDelMes = (amount: number) => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
    return {
      amount,
      created_at: `${hoy}T12:00:00Z`,
      proforma_id: "p1",
      balance_after: 0,
      business_id: "b1",
    };
  };

  it("🔴 la deuda migrada NO diluye el índice: no es cartera que se cobre aquí", async () => {
    // La mutación que esto mata: volver a `cobradoMes / (cobradoMes +
    // aging.totalAmount)`. Con RD$100 000 cobrados por el POS y RD$27 207,53
    // migrados abiertos, el índice mezclado dice 78,6 % de una cartera que
    // DermaLand recuperó al 100 %. Numerador de una fuente, denominador de
    // dos: el número no significa nada.
    tablas.proforma_payments = { data: [cobroDelMes(100000)] };
    facturasAlegra = [facturaAlegra({ total: 27207.53, balance: 27207.53, totalPaid: 0 })];
    const s = await summary(ctx);
    expect(s.cobradoMes).toBe(100000);
    expect(s.recuperacionPct).toBe(100);
  });

  it("con cartera propia abierta el índice baja, que es lo que debe medir", async () => {
    tablas.proforma_payments = { data: [cobroDelMes(300)] };
    tablas.proformas = {
      data: [
        {
          id: "p9",
          number: "FAC-9",
          customer_name: "Ana",
          branch_id: "b",
          cashier_name: "Rosa",
          created_at: "2026-09-01T00:00:00Z",
          due_date: "2026-09-30",
          total: 100,
          paid: 0,
          balance: 100,
          status: "issued",
        },
      ],
    };
    expect((await summary(ctx)).recuperacionPct).toBe(75);
  });

  it("🔴 sin cobros ni cartera propia vuelve a «N/D», no a 0,0 %", async () => {
    // Es el estado de HOY: 0 proformas con saldo y RD$27 207,53 migrados. Con
    // el denominador mezclado la tarjeta pasó de «—» a «0,0 %» sin que nada
    // cambiara en la operación.
    facturasAlegra = [facturaAlegra({ total: 27207.53, balance: 27207.53, totalPaid: 0 })];
    expect((await summary(ctx)).recuperacionPct).toBeNull();
  });
});

describe("resumen de cuentas por cobrar", () => {
  it("el total incluye los saldos de Alegra y dice cuánto pone cada fuente", async () => {
    facturasAlegra = [facturaAlegra({ balance: 600 }), facturaAlegra({ id: "22222222-2222-2222-2222-222222222222", balance: 400 })];
    const s = await summary(ctx);
    expect(s.totalPendiente).toBe(1000);
    expect(s.porOrigen.alegra).toEqual({ total: 1000, facturas: 2 });
    expect(s.porOrigen.sistema).toEqual({ total: 0, facturas: 0 });
  });

  it("sin histórico con saldo, el desglose da cero y no rompe nada", async () => {
    const s = await summary(ctx);
    expect(s.porOrigen.alegra).toEqual({ total: 0, facturas: 0 });
  });
});

describe("aplicar un cobro", () => {
  it("🔴 rechaza el cobro si algún id es una factura migrada de Alegra", async () => {
    // Defensa de servidor: aunque una pantalla futura se olvide del filtro, o
    // alguien llame la API a mano, aquí se para — y con el motivo de verdad,
    // no con el «Venta no encontrada.» del RPC, que no explica nada.
    tablas.alegra_invoices = { data: [{ id: ID_ALEGRA }] };
    await expect(
      collect(ctx, { items: [{ proformaId: ID_ALEGRA, amount: 600 }], method: "cash" }),
    ).rejects.toThrow(/Alegra/);
    // Y no se llegó a tocar la base: ni un pago a medias.
    expect(rpcLlamado).not.toHaveBeenCalled();
  });

  it("🔴 basta UNA factura de Alegra en el lote para que no se aplique nada", async () => {
    // Un cobro múltiple es atómico: o entran todas o no entra ninguna. Aplicar
    // «las que se pueda» dejaría al usuario creyendo que cobró todo.
    //
    // N6: `toThrow(MOTIVO_ALEGRA_NO_COBRABLE)` compararía el mensaje contra la
    // MISMA constante que lanza `service.ts:414` — sobrevive a cualquier
    // reescritura del texto, y como `toThrow(string)` matchea por SUBCADENA,
    // si la constante se vaciara coincidiría con cualquier error (hasta uno
    // que no tenga nada que ver con Alegra). Fijo el literal, como la
    // hermana de arriba.
    tablas.alegra_invoices = { data: [{ id: ID_ALEGRA }] };
    await expect(
      collect(ctx, {
        items: [
          { proformaId: "p1", amount: 100 },
          { proformaId: ID_ALEGRA, amount: 600 },
        ],
        method: "cash",
      }),
    ).rejects.toThrow(/Alegra/);
    expect(rpcLlamado).not.toHaveBeenCalled();
  });

  it("🔴 el guard mira SOLO los ids del lote, no todo el histórico del negocio", async () => {
    // La mutación que esto mata: borrar el `.in("id", ids)` del guard. La
    // consulta pasaría a devolver las 14 965 facturas migradas del negocio,
    // `length > 0` sería siempre cierto y MORIRÍA CADA COBRO DEL SISTEMA con
    // el mensaje de Alegra. El módulo de cobranza dejaría de funcionar entero.
    tablas.alegra_invoices = { data: [{ id: ID_ALEGRA }, { id: "22222222-2222-2222-2222-222222222222" }] };
    await collect(ctx, { items: [{ proformaId: "p1", amount: 100 }], method: "cash" });
    expect(rpcLlamado).toHaveBeenCalledWith("ar_apply_payments", expect.anything());
  });

  it("🔴 y pregunta por EXACTAMENTE los ids del lote", async () => {
    tablas.alegra_invoices = { data: [] };
    await collect(ctx, {
      items: [
        { proformaId: "p1", amount: 100 },
        { proformaId: "p2", amount: 50 },
      ],
      method: "cash",
    });
    const consultaAlegra = filtrosIn.find((f) => f.tabla === "alegra_invoices");
    expect(consultaAlegra).toBeDefined();
    expect(consultaAlegra!.columna).toBe("id");
    expect(consultaAlegra!.valores).toEqual(["p1", "p2"]);
  });

  it("un cobro normal del sistema sigue pasando al RPC", async () => {
    tablas.alegra_invoices = { data: [] };
    await collect(ctx, { items: [{ proformaId: "p1", amount: 100 }], method: "cash" });
    expect(rpcLlamado).toHaveBeenCalledWith("ar_apply_payments", expect.anything());
  });
});

/**
 * 🔴 "LA FACTURA A CREDITO CREAN PROFORMA / NO PAGAN INCENTIVOS / SOLO CUANDO
 * SE HACE EL COBRO" (pedido del dueño, 10/09/2026): una venta a crédito no
 * tiene pagos en `proforma_payments` al emitirse, así que
 * `paymentGroupsForSale` no encuentra ningún grupo y ninguna regla de
 * incentivo aplica — el vendedor nunca cobraba su comisión de esa venta,
 * NI SIQUIERA cuando el cliente terminaba pagando por Cuentas por Cobrar. El
 * cobro es justo el momento en que SÍ hay un método de pago real: aquí se
 * dispara (de nuevo) el mismo generador idempotente que usa el POS.
 */
describe("cobro → genera los incentivos que la venta a crédito no generó al emitirse", () => {
  it("al aplicar el cobro de una factura, se generan sus incentivos", async () => {
    tablas.alegra_invoices = { data: [] };
    rpcRespuesta = {
      data: [{ proforma_id: "p1", number: "FAC-1", amount: 100, new_balance: 0, new_status: "paid" }],
      error: null,
    };
    await collect(ctx, { items: [{ proformaId: "p1", amount: 100 }], method: "cash" });
    expect(generarIncentivos).toHaveBeenCalledWith("b1", "p1");
  });

  it("un cobro de varias facturas genera incentivos para CADA una, sin duplicar", async () => {
    tablas.alegra_invoices = { data: [] };
    rpcRespuesta = {
      data: [
        { proforma_id: "p1", number: "FAC-1", amount: 100, new_balance: 0, new_status: "paid" },
        { proforma_id: "p2", number: "FAC-2", amount: 50, new_balance: 0, new_status: "paid" },
      ],
      error: null,
    };
    await collect(ctx, {
      items: [
        { proformaId: "p1", amount: 100 },
        { proformaId: "p2", amount: 50 },
      ],
      method: "cash",
    });
    expect(generarIncentivos).toHaveBeenCalledTimes(2);
    expect(generarIncentivos).toHaveBeenCalledWith("b1", "p1");
    expect(generarIncentivos).toHaveBeenCalledWith("b1", "p2");
  });

  it("🔴 si falla generar incentivos, el cobro ya aplicado NO se reporta como fallido", async () => {
    // El dinero ya se aplicó vía RPC (atómico en la base); la comisión es
    // best-effort, igual que en el POS ("no bloquea la venta").
    tablas.alegra_invoices = { data: [] };
    rpcRespuesta = {
      data: [{ proforma_id: "p1", number: "FAC-1", amount: 100, new_balance: 0, new_status: "paid" }],
      error: null,
    };
    generarIncentivos.mockRejectedValueOnce(new Error("boom"));
    const resultado = await collect(ctx, { items: [{ proformaId: "p1", amount: 100 }], method: "cash" });
    expect(resultado.totalApplied).toBe(100);
  });

  it("un cobro sin facturas migradas y SIN aplicar nada (RPC vacío) no dispara incentivos", async () => {
    tablas.alegra_invoices = { data: [] };
    rpcRespuesta = { data: [], error: null };
    await collect(ctx, { items: [{ proformaId: "p1", amount: 100 }], method: "cash" });
    expect(generarIncentivos).not.toHaveBeenCalled();
  });
});
