import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepositories } from "@/server/repositories";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";

/**
 * El registro de auditoría REAL.
 *
 * La pantalla `/admin/auditoria` leía `mockAuditLogs` —doce filas inventadas—
 * mientras la tabla `audit_logs` se llenaba de verdad. Con el ojo de las claves
 * eso pasa de ser un adorno roto a un problema: la salvaguarda que hace
 * aceptable guardar claves legibles es «cada consulta queda registrada», y esa
 * promesa no vale nada si el dueño no puede VER el registro.
 *
 * Solo administradores: aquí se ve quién miró la clave de quién.
 */
export const dynamic = "force-dynamic";

/** Tope duro. Lo decide el servidor, no quien llama. */
const TOPE = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ logs: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
  if (!auth.ok) return auth.res;

  const pedido = Number(req.nextUrl.searchParams.get("limit"));
  const limite = Number.isFinite(pedido) && pedido > 0 ? Math.min(Math.trunc(pedido), TOPE) : 100;
  const filtro = (req.nextUrl.searchParams.get("action") ?? "").trim();

  try {
    const ctx = await getRepoContext();
    const logs = await getRepositories().audit.list(ctx, limite);
    // El filtro por prefijo se aplica AQUÍ, no en el navegador: mandar el
    // registro entero para que el cliente esconda la mitad es enseñar de más.
    const filtrados = filtro ? logs.filter((l) => l.action.startsWith(filtro)) : logs;
    return NextResponse.json({ logs: filtrados }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar la auditoría.") },
      { status: 400 },
    );
  }
}
