import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { parseJsonBody } from "@/server/http/parse-body";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { ALEGRA_READ_ROLES, ALEGRA_SYNC_ROLES } from "@/features/alegra/roles";
import { resumenAlegra, ultimasCorridas } from "@/server/services/alegra/queries";
import { dispararSincronizacion } from "@/server/services/alegra/dispatch";

export const dynamic = "force-dynamic";

/** Estado del sincronizador: últimas corridas y cuánto hay traído. */
export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ runs: [], summary: null, canTrigger: false });
  }
  const auth = await authorizeRole(ALEGRA_READ_ROLES);
  if (!auth.ok) return auth.res;
  try {
    const ctx = await getRepoContext();
    const [runs, summary] = await Promise.all([ultimasCorridas(ctx), resumenAlegra(ctx)]);
    return NextResponse.json(
      { runs, summary, canTrigger: Boolean(env.GITHUB_ACTIONS_TOKEN) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo leer el estado de la sincronización.") },
      { status: 400 },
    );
  }
}

const bodySchema = z.object({
  modo: z.enum(["incremental", "full"]).default("incremental"),
  entidades: z.string().max(120).optional(),
  simulacion: z.boolean().optional(),
});

/**
 * Pide a GitHub Actions que corra la sincronización. La app nunca sincroniza
 * por su cuenta: así el token de Alegra vive solo en los secretos del workflow.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRole(ALEGRA_SYNC_ROLES);
  if (!auth.ok) return auth.res;

  const parsed = await parseJsonBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;

  const r = await dispararSincronizacion({
    modo: parsed.data.modo,
    entidades: parsed.data.entidades,
    simulacion: parsed.data.simulacion,
  });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  return NextResponse.json({
    ok: true,
    url: r.url,
    mensaje:
      "Sincronización lanzada. Tarda unos minutos; el resultado aparece aquí cuando termine.",
  });
}
