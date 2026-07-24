import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import { INVENTORY_MANAGE_ROLES } from "@/features/billing/permissions";

// SEC-006: aprobar/rechazar un conteo es el gate contable del ajuste de
// inventario → segregación de funciones (no un cajero cualquiera).
const COUNT_APPROVER_ROLES = new Set(["super_admin", "admin", "manager", "supervisor", "inventory"]);

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
    if (action === "submit") {
      // DL-01: enviar un conteo a revisión es operación de inventario, no de cualquiera.
      const session = await getSession();
      if (!session || !(session.isPlatformAdmin || INVENTORY_MANAGE_ROLES.includes(session.user.role)))
        return NextResponse.json({ error: "No tienes permiso para enviar conteos." }, { status: 403 });
      await repo.submit(ctx, id);
    }
    else if (action === "approve" || action === "reject") {
      const session = await getSession();
      if (!session || !COUNT_APPROVER_ROLES.has(session.user.role))
        return NextResponse.json({ error: "No tienes permiso para aprobar o rechazar conteos." }, { status: 403 });
      if (action === "approve") await repo.approve(ctx, id);
      else await repo.reject(ctx, id, reason ?? "");
    }
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
