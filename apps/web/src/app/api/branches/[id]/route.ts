import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { STOREFRONT_TENANT_TAG } from "@/server/services/storefront/tenant";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";
import { parseJsonBody } from "@/server/http/parse-body";
import { catalogEdit } from "@/server/http/schemas";

export const dynamic = "force-dynamic";

/**
 * El pie de la tienda se sirve de una caché de cinco minutos. Sin esto, pegar
 * el enlace de Google Maps de una sucursal —o cambiarle el nombre público, u
 * ocultarla— guardaba bien pero no se veía, y el minuto siguiente se pasa
 * volviendo a guardar creyendo que falló.
 */
function refrescarTienda() {
  revalidateTag(STOREFRONT_TENANT_TAG);
}

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de sucursales en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
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
    const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
    if (!auth.ok) return auth.res;
    const parsed = await parseJsonBody(req, catalogEdit);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data;
    const ctx = await getRepoContext();
    const branch = await getRepositories().branch.update(ctx, id, body);
    refrescarTienda();
    return NextResponse.json({ branch });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar la sucursal. Intenta nuevamente.") }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
    if (!auth.ok) return auth.res;
    const ctx = await getRepoContext();
    await getRepositories().branch.softDelete(ctx, id);
    refrescarTienda();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar la sucursal. Intenta nuevamente.") }, { status: 400 });
  }
}
