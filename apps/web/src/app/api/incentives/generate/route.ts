import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { env } from "@/lib/env";
import { generateIncentivesForSaleServer } from "@/server/services/incentives/incentive-admin";

/**
 * POST /api/incentives/generate  { saleId }
 * Genera (idempotente) los incentivos de una venta pagada. Se llama tras
 * completar la venta en el POS. NO bloquea la venta si falla.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase")
    return NextResponse.json({ error: "Disponible solo con Supabase" }, { status: 501 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { saleId?: string };
  if (!body.saleId)
    return NextResponse.json({ error: "saleId requerido" }, { status: 400 });
  try {
    const { generated } = await generateIncentivesForSaleServer(
      session.businessId,
      body.saleId,
    );
    return NextResponse.json({ ok: true, generated });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron generar los incentivos." },
      { status: 500 },
    );
  }
}
