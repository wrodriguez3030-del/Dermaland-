import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { Customer } from "@/types";
import { authorizeRole } from "@/server/auth/require-role";
import { ROLES_CON_RIESGO } from "@/features/auth/riesgo-operativo";
import { createServer } from "@/lib/supabase/server";
import { clientRowToTs } from "@/server/repositories/supabase/mappers";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";
import { scanAllDuplicates } from "@/features/customers/utils/duplicate-detection";

/**
 * GET /api/customers/duplicates — escaneo COMPLETO de posibles duplicados
 * del negocio, para la pantalla `/clientes/unificar`. Admin-only: barre
 * TODA la base (6 525 clientes hoy — sin caché v1, YAGNI, ver diseño
 * aprobado) así que no es algo para pedir en cada render de un listado.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Unificar clientes solo está disponible en modo Supabase." },
      { status: 409 },
    );
  }
  const auth = await authorizeRole(ROLES_CON_RIESGO);
  if (!auth.ok) return auth.res;

  const businessId = auth.session.businessId;
  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ error: "No se pudo conectar con la base." }, { status: 502 });
  }

  const rows = await fetchAllPages(async (from, to) => {
    const { data, error } = await sb
      .from("clients")
      .select("*")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data ?? [];
  });

  const clients: Customer[] = rows.map(clientRowToTs);
  const pairs = scanAllDuplicates(clients);

  return NextResponse.json({ pairs }, { headers: { "Cache-Control": "no-store" } });
}
