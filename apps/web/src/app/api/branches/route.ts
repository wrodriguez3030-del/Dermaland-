import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

/**
 * Sucursales — fuente de verdad de servidor (single source) cuando
 * DATA_SOURCE=supabase. RLS por business_id vía el contexto del JWT.
 *
 * En modo `mock` la UI usa el store local (branch-store); estas rutas quedan
 * disponibles para cuando se conecte Supabase. `no-store` para no congelar
 * datos en caché.
 */
export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de sucursales en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const scope = req.nextUrl.searchParams.get("scope");
    const ctx = await getRepoContext();
    const branches = await getRepositories().branch.list(ctx, {
      activeOnly: scope !== "admin",
    });
    return NextResponse.json(
      { branches },
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
    const branch = await getRepositories().branch.create(ctx, body);
    return NextResponse.json({ branch }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
