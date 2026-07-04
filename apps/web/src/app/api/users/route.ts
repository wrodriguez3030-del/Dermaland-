import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

/**
 * GET /api/users — usuarios del negocio (RLS por business_id vía JWT).
 * Fuente del selector de VENDEDOR en el POS y del filtro por vendedor en
 * Ventas/Reportes. En modo mock la UI usa el store local.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Backend de usuarios en modo local (DATA_SOURCE=mock)." },
      { status: 409 },
    );
  }
  try {
    const ctx = await getRepoContext();
    const users = await getRepositories().user.list(ctx);
    return NextResponse.json(
      { users },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar los usuarios.") },
      { status: 400 },
    );
  }
}
