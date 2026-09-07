import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * `GET /api/ventas` ejecutada de verdad, con el portero y el repositorio
 * falsos. No es una comprobación de texto sobre el archivo: se llama al
 * handler y se mira el status y el cuerpo, porque lo que hay que garantizar
 * son RESPUESTAS.
 *
 * 🔴 Lo que protege:
 *
 *  - Una `dimension` desconocida (o ausente) es un 400. Si cayera en un
 *    desglose vacío, la tarjeta enseñaría «sin datos» — indistinguible de un
 *    período sin ventas — sobre un histórico de RD$48 millones. Es el mismo
 *    fallo silencioso que este plan entero existe para cerrar.
 *  - La vista nueva pide el MISMO rol y manda el MISMO `Cache-Control` que las
 *    otras dos. Una vista nueva con el portero flojo sería la puerta de atrás
 *    a las ventas de todo el negocio.
 *  - Sin Supabase, respuesta vacía con la forma que espera quien llama.
 */

const authorizeRole = vi.fn();
const getRepoContext = vi.fn(async () => ({ businessId: "b1" }));
/**
 * Los parámetros van DECLARADOS aunque el falso no los use: sin ellos
 * `desgloseVentas.mock.calls[0]` es la tupla vacía y no se puede inspeccionar
 * qué recibió el repositorio, que es la mitad de lo que estas pruebas miran.
 */
const desgloseVentas = vi.fn(
  async (_ctx: { businessId: string }, _filtros: Record<string, unknown>, _dimension: string) => [
    { clave: "DESTENY REYNOSO", etiqueta: "DESTENY REYNOSO", origen: "alegra", cantidad: 5513, total: 1 },
  ],
);
const resumenVentas = vi.fn(async () => ({
  total: 0,
  cantidad: 0,
  porOrigen: { sistema: { total: 0, cantidad: 0 }, alegra: { total: 0, cantidad: 0 } },
}));
const listarVentasUnificadas = vi.fn(async () => ({ ventas: [], hayMas: false }));

/** El origen de datos, mutable entre pruebas (mock ↔ supabase). */
const env = { DATA_SOURCE: "supabase" };

vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/server/auth/require-role", () => ({ authorizeRole }));
vi.mock("@/server/auth/context", () => ({ getRepoContext }));
vi.mock("@/server/repositories/supabase/client", () => ({
  toUserFacingMessage: (_e: unknown, porDefecto: string) => porDefecto,
}));
vi.mock("@/server/repositories/supabase/ventas-unificadas", async (original) => ({
  // `DIMENSIONES_DESGLOSE` NO se copia aquí: se toma del módulo de verdad, para
  // que añadir una cuarta dimensión al repositorio y olvidarse de esta ruta se
  // note. Solo se sustituyen las tres funciones que hablan con la base.
  ...(await original<typeof import("@/server/repositories/supabase/ventas-unificadas")>()),
  desgloseVentas,
  resumenVentas,
  listarVentasUnificadas,
}));

const { GET } = await import("./route");

const pedir = (query: string) => GET(new NextRequest(`http://localhost/api/ventas?${query}`));

beforeEach(() => {
  env.DATA_SOURCE = "supabase";
  authorizeRole.mockReset().mockResolvedValue({ ok: true });
  desgloseVentas.mockClear();
  resumenVentas.mockClear();
  listarVentasUnificadas.mockClear();
});

describe("GET /api/ventas?vista=desglose", () => {
  it("devuelve el desglose de la dimensión pedida", async () => {
    const res = await pedir("vista=desglose&dimension=vendedor");
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { desglose: { etiqueta: string; origen: string }[] };
    expect(cuerpo.desglose[0]!.etiqueta).toBe("DESTENY REYNOSO");
    expect(cuerpo.desglose[0]!.origen).toBe("alegra");
    expect(desgloseVentas).toHaveBeenCalledWith(
      { businessId: "b1" },
      expect.anything(),
      "vendedor",
    );
  });

  it.each(["vendedor", "forma_pago", "producto"])(
    "acepta la dimensión %s y se la pasa tal cual al repositorio",
    async (dim) => {
      const res = await pedir(`vista=desglose&dimension=${dim}`);
      expect(res.status).toBe(200);
      expect(desgloseVentas.mock.calls[0]![2]).toBe(dim);
    },
  );

  it("🔴 una dimensión desconocida es un 400, NO un desglose vacío", async () => {
    const res = await pedir("vista=desglose&dimension=nomina");
    expect(res.status).toBe(400);
    expect(desgloseVentas).not.toHaveBeenCalled();
  });

  it("🔴 pedir un desglose sin decir de qué también es un 400", async () => {
    const res = await pedir("vista=desglose");
    expect(res.status).toBe(400);
    const cuerpo = (await res.json()) as { error: string };
    expect(cuerpo.error).toMatch(/dimension/i);
    expect(desgloseVentas).not.toHaveBeenCalled();
  });

  it("🔴 exige el mismo rol que las otras dos vistas: sin permiso no se llama al repositorio", async () => {
    const prohibido = Response.json({ error: "no" }, { status: 403 });
    authorizeRole.mockResolvedValue({ ok: false, res: prohibido });
    const res = await pedir("vista=desglose&dimension=vendedor");
    expect(res.status).toBe(403);
    expect(desgloseVentas).not.toHaveBeenCalled();
  });

  it("no se cachea, igual que resumen y listado", async () => {
    for (const q of ["vista=desglose&dimension=vendedor", "vista=resumen", "vista=listado"]) {
      const res = await pedir(q);
      expect(res.headers.get("Cache-Control"), q).toBe("no-store");
    }
  });

  it("filtra por fecha, cliente y sucursal como las otras vistas", async () => {
    const res = await pedir(
      "vista=desglose&dimension=producto&desde=2026-01-01&hasta=2026-01-31" +
        "&sucursalId=11111111-1111-4111-8111-111111111111",
    );
    expect(res.status).toBe(200);
    expect(desgloseVentas.mock.calls[0]![1]).toMatchObject({
      desde: "2026-01-01",
      hasta: "2026-01-31",
      sucursalId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("una fecha con formato inventado es un 400, no un desglose de todo el histórico", async () => {
    const res = await pedir("vista=desglose&dimension=vendedor&desde=ayer");
    expect(res.status).toBe(400);
    expect(desgloseVentas).not.toHaveBeenCalled();
  });

  it("🔴 la respuesta dice QUÉ FUENTES trae: no todas las dimensiones traen las dos", () => {
    // `vendedor` trae proformas + Alegra; `forma_pago` y `producto`, solo
    // Alegra. Hoy `proformas` está vacía y por eso cualquiera de las tres
    // parece completa: quien la consuma aprendería que cuadra, y el día que el
    // POS facture recibiría media verdad sin nada que la marque.
    return Promise.all([
      pedir("vista=desglose&dimension=vendedor").then((r) => r.json()),
      pedir("vista=desglose&dimension=forma_pago").then((r) => r.json()),
      pedir("vista=desglose&dimension=producto").then((r) => r.json()),
    ]).then(([vendedor, pago, producto]) => {
      expect((vendedor as { fuentes: string[] }).fuentes).toEqual(["sistema", "alegra"]);
      expect((pago as { fuentes: string[] }).fuentes).toEqual(["alegra"]);
      expect((producto as { fuentes: string[] }).fuentes).toEqual(["alegra"]);
    });
  });

  it("🔴 con `incluirAlegra=false` el histórico ya no se anuncia como fuente", async () => {
    // Anunciar una fuente que se acaba de excluir es peor que no anunciar
    // ninguna: el consumidor sumaría creyendo que el histórico está dentro.
    const vendedor = (await (
      await pedir("vista=desglose&dimension=vendedor&incluirAlegra=false")
    ).json()) as { fuentes: string[] };
    expect(vendedor.fuentes).toEqual(["sistema"]);
    const pago = (await (
      await pedir("vista=desglose&dimension=forma_pago&incluirAlegra=false")
    ).json()) as { fuentes: string[] };
    expect(pago.fuentes).toEqual([]);
  });

  it("sin Supabase devuelve un desglose vacío con la forma que espera quien llama", async () => {
    env.DATA_SOURCE = "mock";
    const res = await pedir("vista=desglose&dimension=vendedor");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ desglose: [], fuentes: [] });
    // Y ni siquiera pregunta por el rol: no hay nada que proteger.
    expect(authorizeRole).not.toHaveBeenCalled();
  });

  it("las otras dos vistas siguen funcionando igual", async () => {
    expect(await (await pedir("vista=resumen")).json()).toHaveProperty("resumen");
    expect(await (await pedir("vista=listado")).json()).toHaveProperty("ventas");
    // Sin `vista`, el listado sigue siendo el valor por defecto.
    expect(await (await pedir("")).json()).toHaveProperty("ventas");
  });
});
