import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

/**
 * Proformas — fuente de verdad del servidor cuando DATA_SOURCE=supabase.
 * RLS por business_id vía el contexto del JWT (nunca del body).
 *
 * En modo `mock` la UI usa el store local (proforma-store); estas rutas
 * responden 409 con instrucción de activar Supabase.
 *
 * NO fiscal / e-CF: convertToEcf queda gated (ver Fase G policy).
 */
export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de proformas en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const proformas = await getRepositories().proforma.list(ctx);
    return NextResponse.json(
      { proformas },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = await req.json();
    const ctx = await getRepoContext();
    const proforma = await getRepositories().proforma.create(ctx, body);
    return NextResponse.json({ proforma }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
