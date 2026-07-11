import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

/**
 * Inventario físico — lista de conteos (Fase 1, LECTURA). Fuente de verdad de
 * servidor cuando DATA_SOURCE=supabase; RLS por business_id vía el JWT.
 *
 * En modo `mock` la UI usa datos locales; esta ruta responde 409 para que el
 * store haga fallback. `no-store` para no congelar datos en caché.
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

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const counts = await getRepositories().inventoryCount.list(ctx);
    return NextResponse.json(
      { counts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar los conteos.") },
      { status: 400 },
    );
  }
}
