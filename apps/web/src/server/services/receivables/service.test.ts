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

/** Builder encadenable que recuerda sus filtros y los aplica al resolver. */
function consulta(tabla: string) {
  const filtros: Filtro[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "gt", "gte", "lte", "lt", "not", "order", "limit", "range", "maybeSingle"]) {
    q[m] = vi.fn(() => q);
  }
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
    const filas = aplicaFiltros(tablas[tabla]?.data ?? [], filtros);
    r({ data: filas, error: null, count: tablas[tabla]?.count ?? filas.length });
  };
  return q;
}

vi.mock("@/server/repositories/supabase/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/repositories/supabase/client")>()),
  getClient: async () => ({
    from: (tabla: string) => consulta(tabla),
    rpc: (...args: unknown[]) => {
      rpcLlamado(...args);
      return Promise.resolve({ data: [], error: null });
    },
  }),
}));

vi.mock("@/server/services/alegra/queries", () => ({
  facturasConSaldo: async () => facturasAlegra,
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
    tablas.alegra_invoices = { data: [{ id: ID_ALEGRA }] };
    await expect(
      collect(ctx, {
        items: [
          { proformaId: "p1", amount: 100 },
          { proformaId: ID_ALEGRA, amount: 600 },
        ],
        method: "cash",
      }),
    ).rejects.toThrow(MOTIVO_ALEGRA_NO_COBRABLE);
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
