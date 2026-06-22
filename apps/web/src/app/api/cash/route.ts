import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";

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
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo cargar la caja. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
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
    const body = (await req.json()) as {
      openingAmount?: unknown;
      branchId?: unknown;
    };
    const openingAmount = Number(body.openingAmount);
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      return NextResponse.json(
        { error: "El monto de apertura debe ser un número válido." },
        { status: 422 },
      );
    }
    const ctx = await getRepoContext();
    const repos = getRepositories();

    // Abrir caja para la sucursal SELECCIONADA arriba si es válida y activa del
    // mismo negocio; si no, la del contexto (JWT). Nunca cross-business (RLS).
    let branchId = ctx.branchId;
    if (typeof body.branchId === "string" && body.branchId) {
      const branch = await repos.branch.byId(ctx, body.branchId);
      if (branch && branch.status === "active") branchId = body.branchId;
    }

    const session = await repos.cashRegister.open({ ...ctx, branchId }, openingAmount);
    return NextResponse.json({ session }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo abrir la caja por un problema de conexión. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
