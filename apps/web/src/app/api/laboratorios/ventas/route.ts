import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { ALEGRA_READ_ROLES } from "@/features/alegra/roles";
import { ventasPorLaboratorio } from "@/server/services/alegra/laboratorios";

export const dynamic = "force-dynamic";

/**
 * Ventas del histórico de Alegra por laboratorio, para el ranking de
 * «Productos → Laboratorios», que sin esto enseña RD$0.00 sobre un histórico
 * de RD$48,4 millones.
 *
 * `nivel=producto` devuelve la misma suma abierta por producto: lo usa la hoja
 * de Excel del ranking. SOLO LECTURA, mismo permiso que el resto del histórico.
 */
const querySchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sucursalId: z.string().uuid().optional(),
  nivel: z.enum(["laboratorio", "producto"]).default("laboratorio"),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Sin Supabase la pantalla se queda con su mitad del sistema (los datos de
  // demostración), que es justo lo que hace hoy.
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ ventas: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const auth = await authorizeRole(ALEGRA_READ_ROLES);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    ...(p.get("desde") && { desde: p.get("desde") }),
    ...(p.get("hasta") && { hasta: p.get("hasta") }),
    ...(p.get("sucursalId") && { sucursalId: p.get("sucursalId") }),
    ...(p.get("nivel") && { nivel: p.get("nivel") }),
  });
  if (!parsed.success) {
    // Un 400, nunca una lista vacía: en pantalla «no hubo ventas» y «el filtro
    // estaba mal» se ven igual, y una de las dos hay que arreglarla.
    return NextResponse.json({ error: "Filtros inválidos." }, { status: 400 });
  }
  const { nivel, ...filtros } = parsed.data;

  try {
    const ctx = await getRepoContext();
    const ventas = await ventasPorLaboratorio(ctx, filtros, nivel);
    return NextResponse.json({ ventas }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar las ventas por laboratorio.") },
      { status: 400 },
    );
  }
}
