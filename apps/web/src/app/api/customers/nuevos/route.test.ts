import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { matchesPeriod } from "@/features/dashboard/dashboard-filters";

/**
 * 🔴 Contar en el servidor tiene que dar EXACTAMENTE lo mismo que contaba el
 * panel en el navegador. Si difiere, la tarjeta enseña un número sobre el
 * negocio que nadie sabría poner en duda.
 *
 * El caso peligroso es «mes 9, todos los años»: eso NO es un rango de fechas.
 * Traducirlo a uno contaría los 6 525 clientes y la tarjeta diría «6 525
 * clientes nuevos este mes».
 */
const filtros: Record<string, unknown> = {};
const q = {
  select: vi.fn(() => q),
  eq: vi.fn(() => q),
  is: vi.fn(() => q),
  gte: vi.fn((c: string, v: string) => {
    filtros.gte = v;
    return q;
  }),
  lt: vi.fn((c: string, v: string) => {
    filtros.lt = v;
    return q;
  }),
  or: vi.fn((v: string) => {
    filtros.or = v;
    return q;
  }),
  then: (r: (x: unknown) => void) => r({ count: 7, error: null }),
};

vi.mock("@/lib/env", () => ({ env: { DATA_SOURCE: "supabase" } }));
vi.mock("@/server/auth/context", () => ({ getRepoContext: async () => ({ businessId: "b1" }) }));
vi.mock("@/server/repositories/supabase/client", () => ({
  getClient: async () => ({ from: () => q }),
  toUserFacingMessage: (_e: unknown, d: string) => d,
}));

const { GET } = await import("./route");
const pedir = (qs: string) =>
  GET(new NextRequest(`http://localhost/api/customers/nuevos?${qs}`));

beforeEach(() => {
  for (const k of Object.keys(filtros)) delete filtros[k];
  vi.clearAllMocks();
});

describe("GET /api/customers/nuevos", () => {
  it("devuelve el conteo, no las filas", async () => {
    const res = await pedir("mes=9&anio=2026");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 7 });
    // `head: true` — ni una fila viaja.
    expect(q.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });

  it("🔴 mes + año: el límite superior es el 1 del mes siguiente, EXCLUSIVO", () => {
    // Con `<= '2026-09-30'` se perdería todo lo creado ese día pasada la
    // medianoche, que es casi todo el día.
    return pedir("mes=9&anio=2026").then(() => {
      expect(filtros.gte).toBe("2026-09-01T00:00:00.000Z");
      expect(filtros.lt).toBe("2026-10-01T00:00:00.000Z");
    });
  });

  it("diciembre cruza bien al año siguiente", async () => {
    await pedir("mes=12&anio=2026");
    expect(filtros.lt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("solo año: el año entero", async () => {
    await pedir("anio=2026");
    expect(filtros.gte).toBe("2026-01-01T00:00:00.000Z");
    expect(filtros.lt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("🔴 solo mes: ese mes de CADA año, no un rango corrido", async () => {
    await pedir("mes=9");
    // Sin esto contaría todos los clientes y la tarjeta mentiría a lo grande.
    expect(filtros.gte, "se usó un rango corrido para «mes de cualquier año»").toBeUndefined();
    expect(String(filtros.or)).toContain("2026-09-01T00:00:00.000Z");
    expect(String(filtros.or)).toContain("2025-09-01T00:00:00.000Z");
    expect(String(filtros.or)).toContain("2018-09-01T00:00:00.000Z");
  });

  it("sin período: todos, sin filtro de fecha", async () => {
    await pedir("");
    expect(filtros.gte).toBeUndefined();
    expect(filtros.lt).toBeUndefined();
    expect(filtros.or).toBeUndefined();
  });

  it("un período inventado es 400", async () => {
    expect((await pedir("mes=13")).status).toBe(400);
    expect((await pedir("mes=cero")).status).toBe(400);
  });

  it("🔴 el criterio coincide con `matchesPeriod`, que es lo que contaba antes", () => {
    // La prueba de equivalencia: para una fecha dada, el rango del servidor
    // acepta exactamente cuando `matchesPeriod` acepta.
    const dentroDelRango = (iso: string, desde: string, hasta: string) =>
      iso >= desde && iso < hasta;
    const casos: [string, number, number, boolean][] = [
      ["2026-09-01T00:00:00.000Z", 9, 2026, true],
      ["2026-09-30T23:59:59.000Z", 9, 2026, true],
      ["2026-10-01T00:00:00.000Z", 9, 2026, false],
      ["2026-08-31T23:59:59.000Z", 9, 2026, false],
    ];
    for (const [iso, mes, anio, esperado] of casos) {
      const dd = String(mes).padStart(2, "0");
      const desde = `${anio}-${dd}-01T00:00:00.000Z`;
      const hasta = mes === 12 ? `${anio + 1}-01-01T00:00:00.000Z` : `${anio}-${String(mes + 1).padStart(2, "0")}-01T00:00:00.000Z`;
      expect(dentroDelRango(iso, desde, hasta), `rango falló con ${iso}`).toBe(esperado);
      expect(
        matchesPeriod(iso, String(mes) as never, String(anio) as never),
        `matchesPeriod difiere con ${iso}`,
      ).toBe(esperado);
    }
  });
});
