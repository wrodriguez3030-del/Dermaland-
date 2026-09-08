import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { getClient, toUserFacingMessage } from "@/server/repositories/supabase/client";

/**
 * Una PÁGINA de clientes, ya filtrada y ordenada por la base.
 *
 * 🔴 POR QUÉ: la pantalla se bajaba los 6 523 clientes para filtrar y ordenar
 * en el navegador. Como PostgREST corta en 1 000 filas, eran SIETE idas y
 * vueltas seguidas (1 394 ms medidos) más las métricas de compras (431 ms):
 * casi dos segundos de servidor antes de mandar nada, y después 3,5 MB de JSON
 * que el navegador tenía que interpretar, filtrar y ordenar.
 *
 * Una página tarda ~130 ms y pesa 20 KB.
 */
export const dynamic = "force-dynamic";

/** Las mismas columnas por las que la tabla deja ordenar. */
const ORDENES = ["createdAt", "name", "totalOrders", "totalSpent", "lastVisit"] as const;

const querySchema = z.object({
  q: z.string().max(120).optional(),
  fuente: z.string().max(40).optional(),
  piel: z.string().max(40).optional(),
  creadosEsteMes: z.enum(["1", "0"]).optional(),
  orden: z.enum(ORDENES).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limite: z.coerce.number().int().min(1).max(200).default(50),
  pagina: z.coerce.number().int().min(0).max(10_000).default(0),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { total: 0, filas: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const p = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(p.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Filtros inválidos." }, { status: 400 });
  }
  const f = parsed.data;

  try {
    const ctx = await getRepoContext();
    const sb = await getClient("customers.pagina");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).rpc("pagina_clientes", {
      p_business_id: ctx.businessId,
      p_busqueda: f.q ?? null,
      p_fuente: f.fuente ?? null,
      p_tipo_piel: f.piel ?? null,
      p_creados_este_mes: f.creadosEsteMes === "1",
      p_orden: f.orden,
      p_desc: f.dir === "desc",
      p_limite: f.limite,
      p_desplazamiento: f.pagina * f.limite,
    });
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar los clientes.") },
      { status: 400 },
    );
  }
}
