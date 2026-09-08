import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DIMENSIONES_DESGLOSE } from "@/features/ventas/venta-unificada";

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
/**
 * 🔴 El contexto sale de la sesión que YA devolvió el portero, no de otra
 * consulta a Supabase Auth. El falso es síncrono a propósito: si la ruta
 * volviera a `getRepoContext()` —que sí pregunta— estas pruebas seguirían en
 * verde y el viaje de red extra volvería sin que nadie lo notara. Por eso
 * `getRepoContext` NO está entre los falsos: usarla revienta el módulo.
 */
const sessionToRepoContext = vi.fn((_s: unknown) => ({ businessId: "b1" }));
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
const resumenVentas = vi.fn(async (_ctx: { businessId: string }, _filtros: Record<string, unknown>) => ({
  total: 0,
  cantidad: 0,
  porOrigen: { sistema: { total: 0, cantidad: 0 }, alegra: { total: 0, cantidad: 0 } },
}));
const listarVentasUnificadas = vi.fn(
  async (_ctx: { businessId: string }, _filtros: Record<string, unknown>) => ({
    ventas: [],
    hayMas: false,
  }),
);

/** El origen de datos, mutable entre pruebas (mock ↔ supabase). */
const env = { DATA_SOURCE: "supabase" };

vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/server/auth/require-role", () => ({ authorizeRole }));
vi.mock("@/server/auth/context", () => ({ sessionToRepoContext }));
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
  authorizeRole.mockReset().mockResolvedValue({ ok: true, session: { businessId: "b1" } });
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

  // 🔴 La lista se LEE del modelo, no se escribe a mano: una dimensión nueva
  // que la ruta rechazara con un 400 dejaría su tarjeta en blanco, y una
  // enumeración copiada aquí no lo notaría nunca.
  it.each([...DIMENSIONES_DESGLOSE])(
    "acepta la dimensión %s y se la pasa tal cual al repositorio",
    async (dim) => {
      const res = await pedir(`vista=desglose&dimension=${dim}`);
      expect(res.status).toBe(200);
      expect(desgloseVentas.mock.calls[0]![2]).toBe(dim);
    },
  );

  it("🔴 las cinco dimensiones del modelo pasan por aquí, no tres", () => {
    // Si alguien añade un nombre a `DIMENSIONES_DESGLOSE` sin su rama en el
    // SQL, la tarjeta enseñaría un desglose VACÍO —indistinguible de «no hubo
    // ventas»— en vez de un 400. `migracion-desglose.test.ts` ata el otro
    // extremo: que la migración vigente cubra exactamente estos nombres.
    expect([...DIMENSIONES_DESGLOSE]).toEqual([
      "vendedor",
      "forma_pago",
      "producto",
      "sucursal",
      "mes",
    ]);
  });

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
    // Y el mensaje NOMBRA las dimensiones que sí valen, todas: enumerarlas a
    // mano dejó el texto diciendo «vendedor, forma_pago o producto» meses
    // después de que existieran cinco.
    for (const dim of DIMENSIONES_DESGLOSE) expect(cuerpo.error).toContain(dim);
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

  it("🔴 las dos dimensiones del panel también declaran su fuente", async () => {
    // `sucursal` y `mes` son SOLO Alegra: la mitad del sistema la calcula el
    // propio panel con todos sus filtros aplicados. Sin este campo, el día que
    // el POS facture, media tarjeta pasaría por entera.
    const sucursal = (await (await pedir("vista=desglose&dimension=sucursal")).json()) as {
      fuentes: string[];
    };
    const mes = (await (await pedir("vista=desglose&dimension=mes")).json()) as {
      fuentes: string[];
    };
    expect(sucursal.fuentes).toEqual(["alegra"]);
    expect(mes.fuentes).toEqual(["alegra"]);
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

/**
 * 🔴 Varias dimensiones en UNA petición.
 *
 * Medido en el navegador el 08/09/2026: el panel disparaba TRECE peticiones al
 * cargar, cuatro de ellas desgloses que solo se diferenciaban en la dimensión.
 * Cada una es una función sin servidor con su propio arranque, y el navegador
 * limita cuántas lanza a la vez.
 */
describe("GET /api/ventas?vista=desglose con varias dimensiones", () => {
  it("🔴 una petición resuelve TODAS las dimensiones pedidas", async () => {
    const res = await pedir("vista=desglose&dimension=vendedor,producto,mes");
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { desgloses?: Record<string, unknown> };
    expect(Object.keys(cuerpo.desgloses ?? {}).sort()).toEqual(["mes", "producto", "vendedor"]);
    // Una llamada a la base por dimensión, no una petición HTTP por dimensión.
    expect(desgloseVentas).toHaveBeenCalledTimes(3);
  });

  it("una sola dimensión conserva la forma de siempre", async () => {
    // Hay pantallas que ya la consumen así; no se les cambia el contrato.
    const res = await pedir("vista=desglose&dimension=vendedor");
    const cuerpo = (await res.json()) as { desglose?: unknown[]; desgloses?: unknown };
    expect(Array.isArray(cuerpo.desglose)).toBe(true);
    expect(cuerpo.desgloses).toBeUndefined();
  });

  it("🔴 una dimensión inventada en la lista es un 400, no un desglose a medias", async () => {
    // Devolver las buenas y callar la mala dejaría una tarjeta vacía sin que
    // nadie supiera por qué.
    const res = await pedir("vista=desglose&dimension=vendedor,inventada");
    expect(res.status).toBe(400);
    expect(desgloseVentas).not.toHaveBeenCalled();
  });

  it("sin dimensión sigue siendo 400", async () => {
    expect((await pedir("vista=desglose")).status).toBe(400);
  });
});

/**
 * 🔴 Varias VISTAS en UNA petición.
 *
 * El panel pedía el resumen, el listado y los desgloses por separado con
 * EXACTAMENTE los mismos filtros: tres funciones sin servidor, tres arranques,
 * para tres consultas que la base resuelve a la vez. Aquí se comprueba que la
 * respuesta combinada trae las tres partes ENTERAS — resolver solo la primera
 * y devolver el resto vacío es el fallo mudo que estas pruebas existen para
 * cazar: el panel pintaría «sin datos» sobre RD$48 millones.
 */
describe("GET /api/ventas con varias vistas", () => {
  const TODAS = "vista=resumen,listado,desglose&dimension=sucursal,forma_pago,producto";

  it("🔴 una petición trae las TRES partes, cada una completa", async () => {
    const res = await pedir(TODAS);
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as {
      resumen?: unknown;
      ventas?: unknown[];
      hayMas?: boolean;
      desgloses?: Record<string, unknown>;
    };
    // Las tres partes. Que falte una es indistinguible de «no hubo ventas».
    expect(cuerpo.resumen).toBeDefined();
    expect(Array.isArray(cuerpo.ventas)).toBe(true);
    expect(cuerpo.hayMas).toBe(false);
    expect(Object.keys(cuerpo.desgloses ?? {}).sort()).toEqual([
      "forma_pago",
      "producto",
      "sucursal",
    ]);
    // Una llamada a la base por cosa pedida, ni una de más.
    expect(resumenVentas).toHaveBeenCalledTimes(1);
    expect(listarVentasUnificadas).toHaveBeenCalledTimes(1);
    expect(desgloseVentas).toHaveBeenCalledTimes(3);
  });

  it("🔴 todas las partes reciben los MISMOS filtros", async () => {
    // Si una vista se quedara con otro rango, el panel sumaría un total de
    // septiembre con un listado de agosto y nadie lo vería.
    await pedir(`${TODAS}&desde=2026-09-01&hasta=2026-09-30&sucursalId=00000000-0000-0000-0000-00000000b001`);
    const esperado = {
      desde: "2026-09-01",
      hasta: "2026-09-30",
      sucursalId: "00000000-0000-0000-0000-00000000b001",
    };
    expect(resumenVentas.mock.calls[0]?.[1]).toMatchObject(esperado);
    expect(listarVentasUnificadas.mock.calls[0]?.[1]).toMatchObject(esperado);
    for (const llamada of desgloseVentas.mock.calls) {
      expect(llamada[1]).toMatchObject(esperado);
    }
  });

  it("dos vistas sin desglose no piden ninguna dimensión", async () => {
    const res = await pedir("vista=resumen,listado");
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { resumen?: unknown; ventas?: unknown[]; desgloses?: unknown };
    expect(cuerpo.resumen).toBeDefined();
    expect(Array.isArray(cuerpo.ventas)).toBe(true);
    expect(cuerpo.desgloses).toBeUndefined();
    expect(desgloseVentas).not.toHaveBeenCalled();
  });

  it("🔴 pedir desglose dentro de la lista SIN dimensión sigue siendo 400", async () => {
    const res = await pedir("vista=resumen,desglose");
    expect(res.status).toBe(400);
    expect(resumenVentas).not.toHaveBeenCalled();
  });

  it("🔴 una vista inventada en la lista es un 400, no una respuesta a medias", async () => {
    const res = await pedir("vista=resumen,inventada");
    expect(res.status).toBe(400);
    expect(resumenVentas).not.toHaveBeenCalled();
  });

  it("una sola vista conserva la forma de siempre", async () => {
    const cuerpo = (await (await pedir("vista=resumen")).json()) as Record<string, unknown>;
    expect(cuerpo.resumen).toBeDefined();
    expect(cuerpo.ventas).toBeUndefined();
    expect(cuerpo.desgloses).toBeUndefined();
  });

  it("la respuesta combinada pide el mismo rol y no se cachea", async () => {
    authorizeRole.mockResolvedValueOnce({
      ok: false,
      res: new Response(null, { status: 403 }),
    });
    expect((await pedir(TODAS)).status).toBe(403);

    const res = await pedir(TODAS);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
