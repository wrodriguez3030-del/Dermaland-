import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de caja en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

/**
 * PATCH /api/cash/[id]
 * Body: { countedCash: number }
 * → cierra la sesión de caja con el efectivo contado.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = (await req.json()) as { countedCash?: unknown };
    const countedCash = Number(body.countedCash);
    if (!Number.isFinite(countedCash) || countedCash < 0) {
      return NextResponse.json(
        { error: "El efectivo contado debe ser un número válido." },
        { status: 422 },
      );
    }
    const ctx = await getRepoContext();
    const session = await getRepositories().cashRegister.close(ctx, id, countedCash);
    return NextResponse.json({ session });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo cerrar la caja. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
