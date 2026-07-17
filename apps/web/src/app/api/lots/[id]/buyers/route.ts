import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import { aggregateLotBuyers } from "@/features/inventory/lot-buyers";

export const dynamic = "force-dynamic";

/**
 * Clientes que compraron un lote (para "Notificar clientes" en un recall).
 * Devuelve la lista agregada por cliente (total comprado + última compra).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ buyers: [] });
  }
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const { id } = await params;
    const ctx = await getRepoContext();
    const repos = getRepositories();
    const rows = await repos.productLot.buyers(ctx, id);
    return NextResponse.json({ buyers: aggregateLotBuyers(rows) });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudieron cargar los clientes del lote. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
