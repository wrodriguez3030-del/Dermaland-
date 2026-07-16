import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de transferencias en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const repos = getRepositories();
    const transfer = await repos.inventoryTransfer.byId(ctx, id);
    if (!transfer) {
      return NextResponse.json(
        { error: "Transferencia no encontrada." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { transfer },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo cargar la transferencia. Intenta de nuevo.",
        ),
      },
      { status: 400 },
    );
  }
}
