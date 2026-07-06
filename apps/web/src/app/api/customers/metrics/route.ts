import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { computeCustomersReport } from "@/features/customers/customer-metrics";

/**
 * GET /api/customers/metrics — métricas agregadas por cliente para el
 * Reporte de Clientes y el listado.
 *
 * Usa la MISMA capa pura del perfil (`computeCustomerPurchaseStats` vía
 * `computeCustomersReport`) sobre cabeceras de ventas (sin ítems/pagos):
 * 2 queries totales, sin N+1, mismos números que el perfil.
 *
 * Query params: ?branchId=<uuid> · ?from=YYYY-MM-DD · ?to=YYYY-MM-DD
 */
export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de clientes en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const branchId = req.nextUrl.searchParams.get("branchId") ?? undefined;
    const from = req.nextUrl.searchParams.get("from") ?? undefined;
    const to = req.nextUrl.searchParams.get("to") ?? undefined;
    const ctx = await getRepoContext();
    const repos = getRepositories();
    const [customers, headers] = await Promise.all([
      repos.customer.list(ctx),
      repos.proforma.listHeaders(ctx, { branchId, from, to }),
    ]);
    // El período/sucursal ya viene filtrado del repo; la función pura agrupa
    // y calcula con las mismas reglas del perfil.
    const rows = computeCustomersReport(customers, headers);
    return NextResponse.json(
      { rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No pudimos cargar el reporte de clientes. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
