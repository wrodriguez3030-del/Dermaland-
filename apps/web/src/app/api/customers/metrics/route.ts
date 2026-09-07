import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import {
  computeCustomersReport,
  fusionarMetricasAlegra,
  type MetricasClienteAlegra,
} from "@/features/customers/customer-metrics";
import { metricasClientesAlegra } from "@/server/repositories/supabase/ventas-unificadas";

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
    // 🔴 La tercera consulta es el histórico migrado de Alegra, agregado POR
    // CLIENTE en la base. Sin ella, los 6 524 clientes salían con RD$0.00 y sin
    // última visita teniendo 14 749 facturas suyas: un cliente que gastó
    // RD$398 710 aparecía como si nunca hubiera comprado.
    //
    // Si esa consulta falla NO se tumba el reporte: se devuelven las métricas
    // del sistema y se dice que el histórico no entró. Media verdad avisada es
    // mejor que una pantalla de error, y muy mejor que media verdad callada.
    const [customers, headers, alegra] = await Promise.all([
      repos.customer.list(ctx),
      repos.proforma.listHeaders(ctx, { branchId, from, to }),
      metricasClientesAlegra(ctx, { desde: from, hasta: to, sucursalId: branchId }).catch(
        (): { filas: MetricasClienteAlegra[]; aviso: string } => ({
          filas: [],
          aviso:
            "No se pudo cargar el histórico migrado de Alegra. Las cifras cuentan solo las ventas del sistema.",
        }),
      ),
    ]);
    // El período/sucursal ya viene filtrado del repo; la función pura agrupa
    // y calcula con las mismas reglas del perfil.
    const rows = fusionarMetricasAlegra(
      computeCustomersReport(customers, headers),
      alegra.filas,
    );
    return NextResponse.json(
      { rows, ...(alegra.aviso ? { aviso: alegra.aviso } : {}) },
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
