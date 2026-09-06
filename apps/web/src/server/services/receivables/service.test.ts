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

/** Builder encadenable: cualquier método devuelve el mismo builder. */
function consulta(tabla: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "gte", "lte", "lt", "in", "not", "order", "limit", "range", "maybeSingle"]) {
    q[m] = vi.fn(() => q);
  }
  q.then = (r: (v: unknown) => void) =>
    r({ data: tablas[tabla]?.data ?? [], error: null, count: tablas[tabla]?.count ?? 0 });
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
  id: "11111111-1111-1111-1111-111111111111",
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

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k];
  facturasAlegra = [];
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
    tablas.alegra_invoices = { data: [{ id: "11111111-1111-1111-1111-111111111111" }] };
    await expect(
      collect(ctx, {
        items: [{ proformaId: "11111111-1111-1111-1111-111111111111", amount: 600 }],
        method: "cash",
      }),
    ).rejects.toThrow(/Alegra/);
    // Y no se llegó a tocar la base: ni un pago a medias.
    expect(rpcLlamado).not.toHaveBeenCalled();
  });

  it("🔴 basta UNA factura de Alegra en el lote para que no se aplique nada", async () => {
    // Un cobro múltiple es atómico: o entran todas o no entra ninguna. Aplicar
    // «las que se pueda» dejaría al usuario creyendo que cobró todo.
    tablas.alegra_invoices = { data: [{ id: "11111111-1111-1111-1111-111111111111" }] };
    await expect(
      collect(ctx, {
        items: [
          { proformaId: "p1", amount: 100 },
          { proformaId: "11111111-1111-1111-1111-111111111111", amount: 600 },
        ],
        method: "cash",
      }),
    ).rejects.toThrow(MOTIVO_ALEGRA_NO_COBRABLE);
    expect(rpcLlamado).not.toHaveBeenCalled();
  });

  it("un cobro normal del sistema sigue pasando al RPC", async () => {
    tablas.alegra_invoices = { data: [] };
    await collect(ctx, { items: [{ proformaId: "p1", amount: 100 }], method: "cash" });
    expect(rpcLlamado).toHaveBeenCalledWith("ar_apply_payments", expect.anything());
  });
});
