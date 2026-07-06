import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

/**
 * GET /api/customers/[id]/purchases — compras de UN cliente (perfil).
 *
 * Filtra en SERVIDOR por customer_id (+ fallback legacy por documento/
 * teléfono) y trae ítems/pagos solo de esas ventas — reemplaza el patrón
 * anterior de descargar TODAS las proformas del negocio para filtrar en el
 * navegador (causa de la lentitud del módulo de Clientes).
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const repos = getRepositories();
    const customer = await repos.customer.byId(ctx, id);
    if (!customer) {
      return NextResponse.json(
        { error: "No encontramos este cliente." },
        { status: 404 },
      );
    }
    const purchases = await repos.proforma.listForCustomer(ctx, customer);
    return NextResponse.json(
      { purchases },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No pudimos cargar las compras del cliente. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
