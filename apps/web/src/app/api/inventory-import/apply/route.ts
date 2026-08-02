import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories, type RepoContext } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { parseJsonBody } from "@/server/http/parse-body";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import {
  alegraImportBodySchema,
  INVENTORY_IMPORT_ROLES,
} from "@/features/inventory/alegra-import-schema";
import { buildImportPlan } from "@/features/inventory/alegra-import";
import { loadImportSources } from "@/features/inventory/alegra-import-sources";
import { applyImportPlan, importReference } from "@/features/inventory/alegra-import-apply";

export const dynamic = "force-dynamic";

/**
 * Fecha de hoy en calendario de RD (ISO `YYYY-MM-DD`), NO UTC: el motor
 * (`buildImportPlan`) es puro y no puede llamar `new Date()` internamente
 * (rompería los tests), así que la calcula quien sí tiene reloj: este route
 * handler. Mismo cálculo que el de `/api/inventory-import/preview` (y que
 * `todayRD()` en `features/receivables/aging.ts`), inlineado aquí por la
 * misma razón: no acoplar el importador de inventario a otro feature.
 */
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(
    new Date(),
  );
}

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de inventario en modo local (DATA_SOURCE=mock). Activa Supabase para importar.",
    },
    { status: 409 },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  // Autorización ANTES de leer el body (patrón v0.98.0).
  const auth = await authorizeRole(INVENTORY_IMPORT_ROLES);
  if (!auth.ok) return auth.res;

  const parsed = await parseJsonBody(req, alegraImportBodySchema);
  if (!parsed.ok) return parsed.res;

  try {
    const ctx: RepoContext = await getRepoContext();
    const repos = getRepositories();
    const sources = await loadImportSources(ctx, repos);
    // El plan se RECALCULA en el servidor a partir de las filas del archivo:
    // el cliente nunca dicta qué escribir.
    const plan = buildImportPlan({
      rows: parsed.data.rows,
      products: sources.products,
      principalLots: sources.principalLots,
      cutisLots: sources.cutisLots,
      cutisWarehouseId: sources.cutisWarehouseId,
      zeroMissing: parsed.data.zeroMissing,
      today: todayISO(),
    });
    const result = await applyImportPlan(
      ctx,
      repos,
      plan,
      sources,
      importReference(new Date()),
    );
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo aplicar la importación. Intenta de nuevo.") },
      { status: 400 },
    );
  }
}
