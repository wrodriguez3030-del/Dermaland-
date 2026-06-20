import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

/**
 * Clientes — fuente de verdad del servidor (single source) cuando
 * DATA_SOURCE=supabase. RLS por business_id vía el contexto del JWT.
 *
 * En modo `mock` la UI usa el store local (customer-store); estas rutas
 * quedan disponibles para cuando se conecte Supabase. `no-store` para no
 * congelar datos en caché.
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
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const ctx = await getRepoContext();
    const customers = await getRepositories().customer.list(ctx, { search });
    return NextResponse.json(
      { customers },
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
    const customer = await getRepositories().customer.create(ctx, body);
    return NextResponse.json({ customer }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
