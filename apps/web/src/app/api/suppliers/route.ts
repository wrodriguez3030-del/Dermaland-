import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend de proveedores en modo local (DATA_SOURCE=mock)." },
    { status: 409 },
  );
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const suppliers = await getRepositories().supplier.list(ctx);
    return NextResponse.json({ suppliers }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo completar la operación de compras. Intenta nuevamente.") }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = (await req.json()) as { name: string; rnc?: string; phone?: string; email?: string };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "El nombre del proveedor es obligatorio." }, { status: 422 });
    }
    const ctx = await getRepoContext();
    const supplier = await getRepositories().supplier.create(ctx, body);
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo completar la operación de compras. Intenta nuevamente.") }, { status: 400 });
  }
}
