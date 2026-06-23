import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = await req.json();
    const ctx = await getRepoContext();
    const laboratory = await getRepositories().laboratory.update(ctx, id, body);
    return NextResponse.json({ laboratory });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar el catálogo. Intenta nuevamente.") }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    await getRepositories().laboratory.delete(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar el catálogo. Intenta nuevamente.") }, { status: 400 });
  }
}
