import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

/**
 * Sesiones de caja — fuente de verdad servidor cuando DATA_SOURCE=supabase.
 * RLS por business_id del JWT (nunca del body).
 *
 * En modo `mock` la UI usa el store local (cash-session-store); estas rutas
 * quedan disponibles para cuando se conecte Supabase. `force-dynamic` para
 * no congelar datos en caché.
 */
export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de caja en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

/**
 * GET /api/cash              → sesión abierta actual (null si no hay)
 * GET /api/cash?history=1   → historial de sesiones (límite 30)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const history = req.nextUrl.searchParams.get("history");
    const ctx = await getRepoContext();
    if (history === "1") {
      const sessions = await getRepositories().cashRegister.history(ctx);
      return NextResponse.json(
        { sessions },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const session = await getRepositories().cashRegister.current(ctx);
    return NextResponse.json(
      { session },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/**
 * POST /api/cash
 * Body: { openingAmount: number }
 * → abre una nueva sesión de caja.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = (await req.json()) as { openingAmount?: unknown };
    const openingAmount = Number(body.openingAmount);
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      return NextResponse.json(
        { error: "openingAmount debe ser un número >= 0" },
        { status: 422 },
      );
    }
    const ctx = await getRepoContext();
    const session = await getRepositories().cashRegister.open(ctx, openingAmount);
    return NextResponse.json({ session }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
