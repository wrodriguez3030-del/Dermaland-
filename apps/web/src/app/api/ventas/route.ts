import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
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
 */
const querySchema = z.object({
  vista: z.enum(VISTAS).default("listado"),
  // 🔴 Sin `.default()`: una dimensión que no reconocemos tiene que ser un 400
  // que dice qué se pidió mal, no un desglose de otra cosa ni una tabla vacía
  // —que en esta pantalla es indistinguible de «no hubo ventas»—. La
  // obligatoriedad cuando `vista=desglose` se comprueba abajo, con el resto
  // del objeto ya validado.
  dimension: z.enum(DIMENSIONES_DESGLOSE).optional(),
  desde: z.string().regex(FECHA, "Fecha inválida").optional(),
  hasta: z.string().regex(FECHA, "Fecha inválida").optional(),
  clienteId: z.string().uuid().optional(),
  sucursalId: z.string().uuid().optional(),
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
        ? { desglose: [] }
        : { ventas: [], hayMas: false };
  return NextResponse.json(cuerpo, { headers: { "Cache-Control": "no-store" } });
}

/** Ventas unificadas (sistema + Alegra). Solo lectura: nunca escribe en `proformas` ni en `alegra_invoices`. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  // Solo para elegir la FORMA de la respuesta vacía del modo mock; la vista de
  // verdad la decide zod más abajo.
  const pedida = sp.get("vista");
  const vistaCruda: Vista = VISTAS.find((v) => v === pedida) ?? "listado";

  // Sin Supabase no hay `alegra_invoices` ni proformas reales que unificar
  // (el modo mock vive en memoria del proceso, sin histórico de Alegra).
  if (env.DATA_SOURCE !== "supabase") return respuestaVacia(vistaCruda);

  const auth = await authorizeRole(VENTAS_READ_ROLES);
  if (!auth.ok) return auth.res;

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
  if (vista === "desglose" && !dimension) {
    return NextResponse.json(
      { error: "Falta `dimension`: vendedor, forma_pago o producto." },
      { status: 400 },
    );
  }
  const filtrosVentas: FiltrosVentas = filtros;

  try {
    const ctx = await getRepoContext();
    if (vista === "resumen") {
      const resumen = await resumenVentas(ctx, filtrosVentas);
      return NextResponse.json({ resumen }, { headers: { "Cache-Control": "no-store" } });
    }
    if (vista === "desglose") {
      // `dimension` está garantizada por la guarda de arriba; el `!` es lo que
      // pide `noUncheckedIndexedAccess` para no repetir la comprobación.
      const desglose = await desgloseVentas(ctx, filtrosVentas, dimension!);
      return NextResponse.json({ desglose }, { headers: { "Cache-Control": "no-store" } });
    }
    const { ventas, hayMas } = await listarVentasUnificadas(ctx, filtrosVentas);
    return NextResponse.json({ ventas, hayMas }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar las ventas.") },
      { status: 400 },
    );
  }
}
