import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import {
  documentEditability,
  pickEditableProformaFields,
} from "@/features/sales/editability";
import { canEditSales } from "@/features/billing/permissions";

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
 * Proforma individual: GET (byId) y PATCH (cancel).
 *
 * PATCH acepta `{ action: "cancel", reason: string }` para anular.
 * NO exponemos convertToEcf aquí (queda como Fase G / gated).
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const proforma = await getRepositories().proforma.byId(ctx, id);
    if (!proforma) {
      return NextResponse.json({ error: "Proforma no encontrada" }, { status: 404 });
    }
    return NextResponse.json(
      { proforma },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo registrar la venta. Intenta nuevamente.") }, { status: errorStatus(e) });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      action?: string;
      reason?: string;
      patch?: Record<string, unknown>;
    };
    const ctx = await getRepoContext();

    if (body.action === "cancel") {
      const reason = body.reason ?? "";
      await getRepositories().proforma.cancel(ctx, id, reason);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update") {
      // Permiso de rol (servidor): el cliente no es fuente de verdad.
      const session = await getSession();
      if (!session || !canEditSales(session.user.role)) {
        return NextResponse.json(
          { error: "No tienes permiso para editar facturas." },
          { status: 403 },
        );
      }
      const repos = getRepositories();
      const current = await repos.proforma.byId(ctx, id);
      if (!current) {
        return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
      }
      // Bloqueo de documentos ya emitidos fiscalmente / anulados.
      const editability = documentEditability(current);
      if (!editability.editable) {
        return NextResponse.json({ error: editability.reason }, { status: 409 });
      }
      const patch = pickEditableProformaFields(body.patch ?? {});
      const updated = await repos.proforma.update(ctx, id, patch);
      // Auditoría: registra qué cambió (valor anterior → nuevo).
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      const currentRec = current as unknown as Record<string, unknown>;
      for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
        changes[k] = { before: currentRec[k] ?? null, after: patch[k] ?? null };
      }
      try {
        await repos.audit.log(ctx, {
          businessId: ctx.businessId,
          userId: session.user.id,
          userName: session.user.fullName,
          action: "sale.update",
          entity: "proforma",
          entityId: id,
          branchId: ctx.branchId,
          metadata: { changes, reason: body.reason ?? null },
        });
      } catch {
        // La auditoría no debe romper el guardado; ya se logueó server-side.
      }
      return NextResponse.json({ proforma: updated });
    }

    return NextResponse.json(
      { error: "Acción no soportada. Use action: 'cancel' o 'update'." },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo registrar la venta. Intenta nuevamente.") }, { status: errorStatus(e) });
  }
}
