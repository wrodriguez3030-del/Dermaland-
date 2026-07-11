import { NextResponse, type NextRequest } from "next/server";
import { requireAiUser } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { getMonthlyUsage } from "@/server/services/ai/store";

export const dynamic = "force-dynamic";

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Resumen de consumo del mes (con filtros opcionales por proveedor/agente). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiUser();
    const providerId = req.nextUrl.searchParams.get("providerId") ?? undefined;
    const agentId = req.nextUrl.searchParams.get("agentId") ?? undefined;
    const summary = await getMonthlyUsage(session.businessId, {
      providerId, agentId, sinceIso: monthStartIso(),
    });
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
