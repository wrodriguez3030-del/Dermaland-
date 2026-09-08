import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { getClient, toUserFacingMessage } from "@/server/repositories/supabase/client";

/**
 * Resumen de inventario del panel: cuatro números y tres listas de cinco filas.
 *
 * 🔴 POR QUÉ EXISTE: el panel se descargaba el catálogo entero (1 425 KB) y
 * TODOS los lotes (1 250 KB) para calcular eso — 2 675 KB al navegador para
 * quedarse con 1,3 KB. Eran los «par de segundos» que el dueño notaba al
 * cargar. Ahora lo calcula la base en una consulta.
 */
export const dynamic = "force-dynamic";

const querySchema = z.object({
  sucursales: z
    .string()
    .transform((v) => v.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).max(50))
    .optional(),
  dias: z.coerce.number().int().min(1).max(365).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ resumen: null }, { headers: { "Cache-Control": "no-store" } });
  }
  const p = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    ...(p.get("sucursales") && { sucursales: p.get("sucursales") }),
    ...(p.get("dias") && { dias: p.get("dias") }),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Filtros inválidos." }, { status: 400 });
  }

  try {
    const ctx = await getRepoContext();
    const sb = await getClient("dashboard.inventario");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).rpc("resumen_inventario_panel", {
      p_business_id: ctx.businessId,
      // Lista vacía = todas las sucursales, igual que en la función.
      p_sucursales: parsed.data.sucursales ?? null,
      p_dias: parsed.data.dias ?? 90,
    });
    if (error) throw error;
    return NextResponse.json({ resumen: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar el resumen de inventario.") },
      { status: 400 },
    );
  }
}
