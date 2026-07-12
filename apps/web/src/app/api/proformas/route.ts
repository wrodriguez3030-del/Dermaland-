import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import { maxDiscountPercentForRole } from "@/features/billing/permissions";

// C4: helper para mapear errores de autenticación a 401 vs errores genéricos a 400.
function errorStatus(e: unknown): 400 | 401 {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (
    msg.includes("auth") ||
    msg.includes("no autenticado") ||
    msg.includes("session") ||
    msg.includes("jwt")
  ) {
    return 401;
  }
  return 400;
}

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
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo registrar la venta. Intenta nuevamente.") }, { status: errorStatus(e) });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = await req.json();
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    // SEC-012: tope de descuento global por rol (validado server-side; un POST
    // directo no puede evadir el clamp de UI).
    const reqDiscount = Number(body?.discountPercent ?? 0);
    if (Number.isFinite(reqDiscount) && reqDiscount > maxDiscountPercentForRole(session.user.role)) {
      return NextResponse.json(
        { error: `Tu rol no puede aplicar un descuento mayor a ${maxDiscountPercentForRole(session.user.role)}%. Pide autorización a un administrador.` },
        { status: 403 },
      );
    }
    const ctx = await getRepoContext();
    const proforma = await getRepositories().proforma.create(ctx, body);
    return NextResponse.json({ proforma }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo registrar la venta. Intenta nuevamente.") }, { status: errorStatus(e) });
  }
}
