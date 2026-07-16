import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
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

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const repos = getRepositories();
    const transfers = await repos.inventoryTransfer.list(ctx);
    return NextResponse.json(
      { transfers },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudieron cargar las transferencias. Intenta de nuevo.",
        ),
      },
      { status: 400 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const body = await req.json();
    const ctx = await getRepoContext();
    const repos = getRepositories();
    const transfer = await repos.inventoryTransfer.create(ctx, body);
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo crear la transferencia. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
