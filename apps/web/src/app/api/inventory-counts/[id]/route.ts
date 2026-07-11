import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

/**
 * Inventario físico — detalle de un conteo (Fase 1, LECTURA): cabecera + ítems
 * + escaneos, todo por business_id (RLS). 404 si el conteo no existe/otro
 * tenant. 409 en modo mock para que el store haga fallback local.
 */
export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de conteos en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const repo = getRepositories().inventoryCount;
    const count = await repo.byId(ctx, id);
    if (!count) {
      return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });
    }
    const [items, scans] = await Promise.all([
      repo.items(ctx, id),
      repo.scans(ctx, id),
    ]);
    return NextResponse.json(
      { count, items, scans },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar el conteo.") },
      { status: 400 },
    );
  }
}

/**
 * Transición de estado del conteo: { action: "submit"|"approve"|"reject",
 * reason? }. Fase 3 — no muta stock (los ajustes son un paso aparte).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const { action, reason } = await req.json();
    const ctx = await getRepoContext();
    const repo = getRepositories().inventoryCount;
    if (action === "submit") await repo.submit(ctx, id);
    else if (action === "approve") await repo.approve(ctx, id);
    else if (action === "reject") await repo.reject(ctx, id, reason ?? "");
    else
      return NextResponse.json(
        { error: "Acción inválida. Usa submit | approve | reject." },
        { status: 400 },
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo actualizar el conteo.") },
      { status: 400 },
    );
  }
}
