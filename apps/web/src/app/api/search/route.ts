import { NextResponse, type NextRequest } from "next/server";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { hasEnoughChars } from "@/features/search/search-core";

export const dynamic = "force-dynamic";

/** Auth (401) vs error genérico (400) — mismo criterio que /api/proformas. */
function errorStatus(e: unknown): 400 | 401 {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("auth") || msg.includes("autenticad") || msg.includes("session") || msg.includes("jwt")
    ? 401
    : 400;
}

/**
 * Buscador global del sistema. `business_id` se deriva del JWT en
 * `getRepoContext()` — NUNCA del query string (riesgo cross-tenant). RLS +
 * filtro explícito por business_id garantizan el aislamiento por negocio.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  // Consulta demasiado corta: respuesta vacía barata (no toca la base).
  if (!hasEnoughChars(q)) {
    return NextResponse.json(
      { query: q.trim(), groups: [], total: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  // perGroup opcional (para "Ver todos") acotado a 1..50; default lo pone el repo.
  const perGroupRaw = Number(req.nextUrl.searchParams.get("perGroup"));
  const perGroup = Number.isFinite(perGroupRaw)
    ? Math.min(Math.max(Math.trunc(perGroupRaw), 1), 50)
    : undefined;
  try {
    const ctx = await getRepoContext();
    const results = await getRepositories().search.global(ctx, q, perGroup ? { perGroup } : undefined);
    return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo realizar la búsqueda. Intenta nuevamente.") },
      { status: errorStatus(e) },
    );
  }
}
