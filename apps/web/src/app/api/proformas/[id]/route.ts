import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

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
    return NextResponse.json({ error: (e as Error).message }, { status: errorStatus(e) });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = (await req.json()) as { action?: string; reason?: string };
    const ctx = await getRepoContext();

    if (body.action === "cancel") {
      const reason = body.reason ?? "";
      await getRepositories().proforma.cancel(ctx, id, reason);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Acción no soportada. Use action: 'cancel'." },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: errorStatus(e) });
  }
}
