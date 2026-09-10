import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepoContext } from "@/server/auth/context";
import { ROLES_CON_RIESGO } from "@/features/auth/riesgo-operativo";
import { createServer } from "@/lib/supabase/server";
import { isUuid } from "@/server/repositories/supabase/sanitize";
import { getRepositories } from "@/server/repositories";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { dryRunMergeImpact, mergeClients } from "@/server/services/customers/merge-clients";

/**
 * POST /api/customers/merge — body `{ primaryId, duplicateId, dryRun? }`.
 * Admin-only (`ROLES_CON_RIESGO`, mismo criterio que "Eliminar cliente" — la
 * guarda de INTERFAZ de la pantalla NO es la única barrera).
 *
 * `dryRun: true` solo CUENTA (sin escribir, sin auditoría) — alimenta el
 * resumen de la pantalla de comparación. Sin `dryRun`, fusiona de verdad vía
 * `merge_clients` y deja rastro en `audit_logs` (`customer.merge`).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Unificar clientes solo está disponible en modo Supabase." },
      { status: 409 },
    );
  }
  const auth = await authorizeRole(ROLES_CON_RIESGO);
  if (!auth.ok) return auth.res;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      primaryId?: string;
      duplicateId?: string;
      dryRun?: boolean;
    };
    const { primaryId, duplicateId, dryRun } = body;
    if (!isUuid(primaryId) || !isUuid(duplicateId)) {
      return NextResponse.json({ error: "primaryId y duplicateId deben ser ids válidos." }, { status: 400 });
    }
    if (primaryId === duplicateId) {
      return NextResponse.json({ error: "No se puede unificar un cliente consigo mismo." }, { status: 400 });
    }

    const ctx = await getRepoContext();
    const sb = await createServer();
    if (!sb) {
      return NextResponse.json({ error: "No se pudo conectar con la base." }, { status: 502 });
    }

    if (dryRun) {
      const moved = await dryRunMergeImpact(sb, ctx.businessId, duplicateId);
      return NextResponse.json({ moved });
    }

    const result = await mergeClients(sb, primaryId, duplicateId);

    try {
      await getRepositories().audit.log(ctx, {
        businessId: ctx.businessId,
        userId: ctx.userId ?? "",
        userName: ctx.userName ?? "",
        action: "customer.merge",
        entity: "client",
        entityId: primaryId,
        metadata: { duplicateId, moved: result.moved },
      });
    } catch {
      /* la auditoría no debe romper la unificación */
    }

    return NextResponse.json({ moved: result.moved });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo unificar los clientes. Intenta nuevamente.") },
      { status: 400 },
    );
  }
}
