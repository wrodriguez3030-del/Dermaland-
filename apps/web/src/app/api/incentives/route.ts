import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { incentiveRowToClient } from "@/server/services/incentives/incentive-admin";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";

/**
 * GET /api/incentives → incentivos generados (RLS), con filtros:
 *   ?sellerId= &status= &from=YYYY-MM-DD &to=YYYY-MM-DD
 * Incluye el número de comprobante de la venta.
 *
 * 🔴 PostgREST corta cada respuesta en 1000 filas EN SILENCIO (ver
 * `pagination.ts`). Con 2051 incentivos reales, un `.select()` sin
 * `.range()` traía solo los 1000 más recientes — que resultaron ser TODOS
 * de un mismo vendedor (Desteny Reynoso) — y tanto «Incentivos de venta»
 * como «Reporte de comisión de ventas» arman su filtro/ranking de
 * vendedores contando SOBRE ESTE ARRAY: con la mitad desaparecida, ambas
 * pantallas mostraban un solo vendedor donde hay varios. `fetchAllPages`
 * pagina hasta traerlos todos.
 */
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function query(sb: any, sp: URLSearchParams) {
  let q = sb
    .from("sales_incentives")
    .select("*, proformas(number, cashier_name, customer_name, branch_id)")
    .neq("status", "void")
    .order("earned_at", { ascending: false })
    .order("id");

  const sellerId = sp.get("sellerId");
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");
  if (sellerId) q = q.eq("seller_id", sellerId);
  if (status) q = q.eq("status", status);
  if (from) q = q.gte("earned_at", from);
  if (to) q = q.lte("earned_at", `${to}T23:59:59`);
  return q;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase")
    return NextResponse.json({ error: "Disponible solo con Supabase" }, { status: 501 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await fetchAllPages<any>(async (from, to) => {
      const { data, error } = await query(sb, sp).range(from, to);
      if (error) throw error;
      return data ?? [];
    });
    return NextResponse.json({ incentives: data.map(incentiveRowToClient) });
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar los incentivos." }, { status: 500 });
  }
}
