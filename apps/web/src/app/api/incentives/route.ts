import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { incentiveRowToClient } from "@/server/services/incentives/incentive-admin";

/**
 * GET /api/incentives → incentivos generados (RLS), con filtros:
 *   ?sellerId= &status= &from=YYYY-MM-DD &to=YYYY-MM-DD
 * Incluye el número de comprobante de la venta.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase")
    return NextResponse.json({ error: "Disponible solo con Supabase" }, { status: 501 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  let q = sb
    .from("sales_incentives")
    .select("*, proformas(number)")
    .neq("status", "void")
    .order("earned_at", { ascending: false });

  const sellerId = sp.get("sellerId");
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");
  if (sellerId) q = q.eq("seller_id", sellerId);
  if (status) q = q.eq("status", status);
  if (from) q = q.gte("earned_at", from);
  if (to) q = q.lte("earned_at", `${to}T23:59:59`);

  const { data, error } = await q;
  if (error)
    return NextResponse.json({ error: "No se pudieron cargar los incentivos." }, { status: 500 });
  return NextResponse.json({ incentives: (data ?? []).map(incentiveRowToClient) });
}
