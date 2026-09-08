import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { idDeLaBase } from "@/lib/utils/uuid-schema";
import { env } from "@/lib/env";
import { sessionToRepoContext } from "@/server/auth/context";
import { Cronometro } from "@/server/http/server-timing";
import { authorizeRole } from "@/server/auth/require-role";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { ALEGRA_READ_ROLES } from "@/features/alegra/roles";
import {
  desgloseVentas,
  DIMENSIONES_DESGLOSE,
  listarVentasUnificadas,
  resumenVentas,
  type FiltrosVentas,
} from "@/server/repositories/supabase/ventas-unificadas";
import { FUENTES_DESGLOSE, type DimensionDesglose } from "@/features/ventas/venta-unificada";

export const dynamic = "force-dynamic";

/**
 * Ventas unificadas (sistema + Alegra): el mismo permiso que ya usa
 * `/api/alegra/invoices` para ver el historial — "ventas unificadas" es su
 * superconjunto natural (proformas del sistema + facturas migradas), no un
 * permiso nuevo.
 */
const VENTAS_READ_ROLES = ALEGRA_READ_ROLES;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Las tres vistas de esta ruta. Fuera de aquí no hay ninguna otra. */
const VISTAS = ["resumen", "listado", "desglose"] as const;
type Vista = (typeof VISTAS)[number];

/**
 * `?vista=resumen` → totales calculados en la base (`resumenVentas`, lo que
 * usa el panel). `?vista=desglose&dimension=…` → esos mismos totales
 * AGRUPADOS en la base por vendedor, forma de pago o producto, con el origen
 * de cada grupo (`desgloseVentas`, lo que usan las tarjetas del reporte). Por
 * defecto, o `?vista=listado` → una página de filas
 * (`listarVentasUnificadas`, lo que usan los listados). Nunca dos en la
 * misma respuesta: son costos muy distintos y cada pantalla pide solo el
 * que necesita.
 *
 * 🔴 La respuesta del desglose lleva `fuentes` porque NO todas las dimensiones
 * traen las dos: `vendedor` sí, `forma_pago` y `producto` solo Alegra. Hoy
 * `proformas` está vacía y por eso cualquiera de las tres parece completa; el
 * día que el punto de venta facture, sin ese campo la media verdad no se
 * distinguiría de la entera.
 */
const querySchema = z.object({
  /**
   * Una vista, o VARIAS separadas por comas. Igual que con `dimension`: el
   * panel pedía resumen, listado y desglose por separado —tres funciones sin
   * servidor, tres arranques— cuando los tres llevan EXACTAMENTE los mismos
   * filtros. Juntas es una petición.
   */
  vista: z
    .string()
    .transform((v) => v.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(VISTAS)).min(1).max(VISTAS.length))
    .default(["listado"]),
  // 🔴 Sin `.default()`: una dimensión que no reconocemos tiene que ser un 400
  // que dice qué se pidió mal, no un desglose de otra cosa ni una tabla vacía
  // —que en esta pantalla es indistinguible de «no hubo ventas»—. La
  // obligatoriedad cuando `vista=desglose` se comprueba abajo, con el resto
  // del objeto ya validado.
  /**
   * Una dimensión, o VARIAS separadas por comas. Se acepta la lista para que el
   * panel pida sus cuatro desgloses en una sola petición en vez de cuatro.
   */
  dimension: z
    .string()
    .transform((v) => v.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(DIMENSIONES_DESGLOSE)).min(1).max(DIMENSIONES_DESGLOSE.length))
    .optional(),
  desde: z.string().regex(FECHA, "Fecha inválida").optional(),
  hasta: z.string().regex(FECHA, "Fecha inválida").optional(),
  clienteId: idDeLaBase.optional(),
  sucursalId: idDeLaBase.optional(),
  // Solo el texto literal "false" desactiva Alegra; cualquier otra cosa
  // (incluida su ausencia) deja el valor por defecto `true` de
  // `listarVentasUnificadas`/`resumenVentas`.
  incluirAlegra: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  // Sin `.max()` aquí a propósito: el tope duro de 200 lo pone el
  // REPOSITORIO (`Math.min(pedido, 200)`), no esta validación — pedir de más
  // no es un error de la petición, solo da como mucho 200.
  limite: z.coerce.number().int().min(1).optional(),
  desplazamiento: z.coerce.number().int().min(0).optional(),
});

function respuestaVacia(vista: Vista): NextResponse {
  const cuerpo =
    vista === "resumen"
      ? {
          resumen: {
            total: 0,
            cantidad: 0,
            porOrigen: { sistema: { total: 0, cantidad: 0 }, alegra: { total: 0, cantidad: 0 } },
          },
        }
      : vista === "desglose"
        ? { desglose: [], fuentes: [] }
        : { ventas: [], hayMas: false };
  return NextResponse.json(cuerpo, { headers: { "Cache-Control": "no-store" } });
}

/** Ventas unificadas (sistema + Alegra). Solo lectura: nunca escribe en `proformas` ni en `alegra_invoices`. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  // Solo para elegir la FORMA de la respuesta vacía del modo mock; la vista de
  // verdad la decide zod más abajo.
  const pedida = sp.get("vista");
  const vistaCruda: Vista = VISTAS.find((v) => v === (pedida ?? "").split(",")[0]) ?? "listado";

  // Sin Supabase no hay `alegra_invoices` ni proformas reales que unificar
  // (el modo mock vive en memoria del proceso, sin histórico de Alegra).
  if (env.DATA_SOURCE !== "supabase") return respuestaVacia(vistaCruda);

  // Mide dónde se va el tiempo: comprobar la sesión, o preguntarle a la base.
  // Sale en la cabecera `Server-Timing`, visible en la pestaña Red.
  const reloj = new Cronometro();
  const auth = await authorizeRole(VENTAS_READ_ROLES);
  if (!auth.ok) return auth.res;
  reloj.fin("sesion");

  const parsed = querySchema.safeParse({
    vista: sp.get("vista") ?? undefined,
    dimension: sp.get("dimension") ?? undefined,
    desde: sp.get("desde") ?? undefined,
    hasta: sp.get("hasta") ?? undefined,
    clienteId: sp.get("clienteId") ?? undefined,
    sucursalId: sp.get("sucursalId") ?? undefined,
    incluirAlegra: sp.get("incluirAlegra") ?? undefined,
    limite: sp.get("limite") ?? undefined,
    desplazamiento: sp.get("desplazamiento") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros de filtro no válidos." }, { status: 400 });
  }
  const { vista, dimension, ...filtros } = parsed.data;
  // Una dimensión desconocida ya la rechazó zod; la que falta, aquí. En los dos
  // casos es un 400: pedir un desglose sin decir de qué es un error de la
  // petición, no un desglose vacío.
  if (vista.includes("desglose") && (!dimension || dimension.length === 0)) {
    // La lista se ESCRIBE desde `DIMENSIONES_DESGLOSE`, no a mano: enumerarla
    // aquí dejaría el mensaje mintiendo el día que se añada una dimensión
    // (pasó: la tarjeta de sucursal y la de tendencia mensual llegaron
    // después, y este texto seguía diciendo «vendedor, forma_pago o
    // producto»).
    return NextResponse.json(
      { error: `Falta \`dimension\`: ${DIMENSIONES_DESGLOSE.join(", ")}.` },
      { status: 400 },
    );
  }
  const filtrosVentas: FiltrosVentas = filtros;

  try {
    // 🔴 `sessionToRepoContext`, NO `getRepoContext()`: el portero de arriba ya
    // resolvió la sesión y la devuelve. Llamar a `getRepoContext()` aquí
    // preguntaba OTRA VEZ a Supabase Auth quién es el usuario — un viaje de red
    // entero por petición. Medido en producción el 08/09/2026 con
    // `Server-Timing`: 39-86 ms tirados en cada llamada.
    const ctx = sessionToRepoContext(auth.session);
    reloj.fin("contexto");

    // Varias vistas en una sola petición: se resuelven en paralelo contra la
    // base y se devuelven juntas, cada una con la MISMA forma que tendría sola.
    if (vista.length > 1) {
      const partes = await Promise.all(
        vista.map(async (v): Promise<Record<string, unknown>> => {
          if (v === "resumen") {
            return { resumen: await reloj.medir("db_resumen", resumenVentas(ctx, filtrosVentas)) };
          }
          if (v === "desglose") {
            const dims: DimensionDesglose[] = dimension ?? [];
            const hechos = await Promise.all(
              dims.map(async (dim) => {
                // Cada dimensión cronometrada por separado: sin esto «la base
                // tardó 653 ms» no dice CUÁL de las cinco consultas se lo llevó.
                const desglose = await reloj.medir(`db_${dim}`, desgloseVentas(ctx, filtrosVentas, dim));
                const fuentes = FUENTES_DESGLOSE[dim].filter(
                  (f) => f !== "alegra" || filtrosVentas.incluirAlegra !== false,
                );
                return [dim, { desglose, fuentes }] as const;
              }),
            );
            return { desgloses: Object.fromEntries(hechos) };
          }
          const { ventas, hayMas } = await reloj.medir(
            "db_listado",
            listarVentasUnificadas(ctx, filtrosVentas),
          );
          return { ventas, hayMas };
        }),
      );
      reloj.fin("base");
      return NextResponse.json(Object.assign({}, ...partes), {
        headers: reloj.cabeceras({ "Cache-Control": "no-store" }),
      });
    }

    const unica = vista[0]!;
    if (unica === "resumen") {
      const resumen = await resumenVentas(ctx, filtrosVentas);
      reloj.fin("base");
      return NextResponse.json({ resumen }, { headers: reloj.cabeceras({ "Cache-Control": "no-store" }) });
    }
    if (unica === "desglose") {
      // `dimension` está garantizada por la guarda de arriba; el `!` es lo que
      // pide `noUncheckedIndexedAccess` para no repetir la comprobación.
      const dims: DimensionDesglose[] = dimension!;

      // 🔴 VARIAS dimensiones en UNA petición. El panel pedía cuatro por
      // separado (sucursal, forma de pago, producto, mes) y la pantalla de
      // reportes cinco: cada una es una función sin servidor con su propio
      // arranque, y el navegador además limita cuántas lanza a la vez. Medido
      // en el navegador el 08/09/2026, el panel disparaba TRECE peticiones al
      // cargar. Aquí se resuelven en paralelo contra la base, que es donde
      // cuestan 100 ms cada una y no se estorban.
      const resultados = await Promise.all(
        dims.map(async (dim) => {
          const desglose = await desgloseVentas(ctx, filtrosVentas, dim);
          // Qué fuentes trae ESTE desglose. Con `incluirAlegra=false` el
          // histórico se queda fuera, así que tampoco puede anunciarse.
          const fuentes = FUENTES_DESGLOSE[dim].filter(
            (f) => f !== "alegra" || filtrosVentas.incluirAlegra !== false,
          );
          return [dim, { desglose, fuentes }] as const;
        }),
      );

      // Una sola dimensión responde con la forma de siempre: hay pantallas que
      // ya la consumen así y no se les cambia el contrato de rebote.
      reloj.fin("base");
      const primera = resultados[0]!;
      if (resultados.length === 1) {
        return NextResponse.json(primera[1], { headers: reloj.cabeceras({ "Cache-Control": "no-store" }) });
      }
      return NextResponse.json(
        { desgloses: Object.fromEntries(resultados) },
        { headers: reloj.cabeceras({ "Cache-Control": "no-store" }) },
      );
    }
    const { ventas, hayMas } = await listarVentasUnificadas(ctx, filtrosVentas);
    reloj.fin("base");
    return NextResponse.json({ ventas, hayMas }, { headers: reloj.cabeceras({ "Cache-Control": "no-store" }) });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar las ventas.") },
      { status: 400 },
    );
  }
}
