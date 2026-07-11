import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

/**
 * Inventario físico — detalle de un conteo (Fase 1, LECTURA): cabecera + ítems
 * + escaneos, todo por business_id (RLS). 404 si el conteo no existe/otro
 * tenant. 409 en modo mock para que el store haga fallback local.
 */
export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de conteos en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
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
    const repo = getRepositories().inventoryCount;
    const count = await repo.byId(ctx, id);
    if (!count) {
      return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });
    }
    const [items, scans] = await Promise.all([
      repo.items(ctx, id),
      repo.scans(ctx, id),
    ]);
    return NextResponse.json(
      { count, items, scans },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar el conteo.") },
      { status: 400 },
    );
  }
}
