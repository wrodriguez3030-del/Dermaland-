import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { CATALOG_MANAGE_ROLES } from "@/features/billing/permissions";
import { parseJsonBody } from "@/server/http/parse-body";
import { catalogCreate } from "@/server/http/schemas";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida." },
    { status: 409 },
  );
}

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const categories = await getRepositories().category.list(ctx);
    return NextResponse.json({ categories }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar el catálogo. Intenta nuevamente.") }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const auth = await authorizeRole(CATALOG_MANAGE_ROLES);
    if (!auth.ok) return auth.res;
    const parsed = await parseJsonBody(req, catalogCreate);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data;
    const ctx = await getRepoContext();
    const category = await getRepositories().category.create(ctx, body);
    return NextResponse.json({ category }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar el catálogo. Intenta nuevamente.") }, { status: 400 });
  }
}
