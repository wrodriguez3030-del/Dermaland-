import "server-only";
import { NextResponse } from "next/server";
import { getSession, type AuthSession } from "./context";
import type { UserRole } from "@/types";

export type AuthorizeResult =
  | { ok: true; session: AuthSession }
  | { ok: false; res: NextResponse };

/**
 * Gate de autorización server-side para route handlers de MUTACIÓN.
 *
 * Auditoría 2026-07-24 (DL-01): la RLS de Supabase solo valida `business_id`,
 * NO el rol. Este helper es la barrera de rol que faltaba: los platform admins
 * (`isPlatformAdmin`) pasan siempre; el resto debe tener un rol en `allowed`.
 * Devuelve la sesión (para construir el `RepoContext`) o una `NextResponse`
 * 401/403 ya lista para retornar.
 *
 * Uso:
 * ```ts
 * const auth = await authorizeRole(FINANCE_ADMIN_ROLES);
 * if (!auth.ok) return auth.res;
 * const ctx = sessionToRepoContext(auth.session);
 * ```
 */
export async function authorizeRole(
  allowed: ReadonlyArray<UserRole>,
): Promise<AuthorizeResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      res: NextResponse.json({ error: "No autenticado." }, { status: 401 }),
    };
  }
  if (session.isPlatformAdmin || allowed.includes(session.user.role)) {
    return { ok: true, session };
  }
  return {
    ok: false,
    res: NextResponse.json(
      { error: "No tienes permiso para realizar esta acción." },
      { status: 403 },
    ),
  };
}
