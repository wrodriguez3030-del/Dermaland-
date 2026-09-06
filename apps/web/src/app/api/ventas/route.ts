import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { ALEGRA_READ_ROLES } from "@/features/alegra/roles";
import {
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

/**
 * `?vista=resumen` → totales calculados en la base (`resumenVentas`, lo que
 * usa el panel). Por defecto, o `?vista=listado` → una página de filas
 * (`listarVentasUnificadas`, lo que usan los listados). Nunca las dos en la
 * misma respuesta: son dos costos muy distintos y cada pantalla pide solo el
 * que necesita.
 */
const querySchema = z.object({
  vista: z.enum(["resumen", "listado"]).default("listado"),
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

function respuestaVacia(vista: "resumen" | "listado"): NextResponse {
  const cuerpo =
    vista === "resumen"
      ? {
          resumen: {
            total: 0,
            cantidad: 0,
            porOrigen: { sistema: { total: 0, cantidad: 0 }, alegra: { total: 0, cantidad: 0 } },
          },
        }
      : { ventas: [], hayMas: false };
  return NextResponse.json(cuerpo, { headers: { "Cache-Control": "no-store" } });
}

/** Ventas unificadas (sistema + Alegra). Solo lectura: nunca escribe en `proformas` ni en `alegra_invoices`. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const vistaCruda = sp.get("vista") === "resumen" ? "resumen" : "listado";

  // Sin Supabase no hay `alegra_invoices` ni proformas reales que unificar
  // (el modo mock vive en memoria del proceso, sin histórico de Alegra).
  if (env.DATA_SOURCE !== "supabase") return respuestaVacia(vistaCruda);

  const auth = await authorizeRole(VENTAS_READ_ROLES);
  if (!auth.ok) return auth.res;

  const parsed = querySchema.safeParse({
    vista: sp.get("vista") ?? undefined,
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
  const { vista, ...filtros }: { vista: "resumen" | "listado" } & FiltrosVentas = parsed.data;

  try {
    const ctx = await getRepoContext();
    if (vista === "resumen") {
      const resumen = await resumenVentas(ctx, filtros);
      return NextResponse.json({ resumen }, { headers: { "Cache-Control": "no-store" } });
    }
    const { ventas, hayMas } = await listarVentasUnificadas(ctx, filtros);
    return NextResponse.json({ ventas, hayMas }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar las ventas.") },
      { status: 400 },
    );
  }
}
