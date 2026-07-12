import { NextResponse } from "next/server";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getSession } from "@/server/auth/context";
import { canManageCommission } from "@/features/billing/permissions";

/**
 * SEC-007: gate de rol para MUTACIONES de comisión (reglas, exclusiones, lotes,
 * pagos = dinero). Devuelve NextResponse (403/401) si NO puede, o null si OK.
 * La lectura (GET) no requiere este gate.
 */
export async function denyIfNotCommissionAdmin(): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canManageCommission(session.user.role))
    return NextResponse.json({ error: "No tienes permiso para administrar comisiones." }, { status: 403 });
  return null;
}

/**
 * Helpers compartidos por las rutas `app/api/commission/*`.
 *
 * Un archivo NO-route dentro de la carpeta `api/commission` — Next.js solo
 * expone `route.ts`, así que esto queda colocado sin publicar endpoint.
 */

const FALLBACK = "No se pudo completar la operación de comisión. Intenta nuevamente.";

/** 409 cuando el backend está en modo local (DATA_SOURCE=mock). */
export function notSupabase(): NextResponse {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

/** Respuesta de error uniforme (mensaje apto para el usuario, sin detalles técnicos). */
export function fail(e: unknown, fallback: string = FALLBACK): NextResponse {
  return NextResponse.json({ error: toUserFacingMessage(e, fallback) }, { status: 400 });
}
