import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { auditIncentive } from "@/server/services/incentives/incentive-admin";

/**
 * POST /api/incentives/pay  { ids: string[] }
 * Marca incentivos pendientes/aprobados como PAGADOS en un lote
 * (payment_batch_id común + paid_at). No recalcula montos (snapshot).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase")
    return NextResponse.json({ error: "Disponible solo con Supabase" }, { status: 501 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0)
    return NextResponse.json({ error: "Selecciona al menos un incentivo." }, { status: 400 });

  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("sales_incentives")
    .update({ status: "paid", paid_at: now, payment_batch_id: batchId, updated_at: now })
    .in("id", ids)
    .in("status", ["pending", "approved"])
    .select("id");
  if (error)
    return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 422 });

  await auditIncentive(session, "incentives.paid", batchId, {
    count: (data ?? []).length,
    ids: (data ?? []).map((r) => r.id),
  });
  return NextResponse.json({ ok: true, batchId, paid: (data ?? []).length });
}
