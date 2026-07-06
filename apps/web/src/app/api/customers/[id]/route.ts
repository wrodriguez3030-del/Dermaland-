import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de clientes en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

/**
 * GET /api/customers/[id] — UN cliente por id (perfil). 404 real cuando no
 * existe (la UI distingue "cargando" de "no encontrado"). Nunca expone
 * errores técnicos.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const customer = await getRepositories().customer.byId(ctx, id);
    if (!customer) {
      return NextResponse.json(
        { error: "No encontramos este cliente." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { customer },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No pudimos cargar la información del cliente. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
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
    const customer = await getRepositories().customer.update(ctx, id, body);
    return NextResponse.json({ customer });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar el cliente. Intenta nuevamente.") }, { status: 400 });
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
    await getRepositories().customer.softDelete(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar el cliente. Intenta nuevamente.") }, { status: 400 });
  }
}
