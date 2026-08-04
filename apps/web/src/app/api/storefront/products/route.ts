import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CATALOG_MANAGE_ROLES } from "@/features/billing/permissions";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { parseJsonBody } from "@/server/http/parse-body";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { setVisibilityBulk } from "@/server/services/storefront/admin";

/**
 * Publicar o retirar varios productos de una vez.
 *
 * El tope de 1 000 ids no es defensivo por deporte: un cuerpo sin límite
 * dejaría que una sola petición mantuviera abierta una transacción sobre todo el
 * catálogo. Mil cubre de sobra el catálogo entero de este negocio.
 */
export const dynamic = "force-dynamic";

const bulkSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(1000),
  visible: z.boolean(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      {
        error:
          "La tienda en línea necesita Supabase activo (DATA_SOURCE=supabase).",
      },
      { status: 409 },
    );
  }
  try {
    const auth = await authorizeRole(CATALOG_MANAGE_ROLES);
    if (!auth.ok) return auth.res;
    const parsed = await parseJsonBody(req, bulkSchema);
    if (!parsed.ok) return parsed.res;

    const ctx = await getRepoContext();
    const { updated, skipped } = await setVisibilityBulk(
      ctx,
      parsed.data.productIds,
      parsed.data.visible,
    );
    return NextResponse.json({ updated, skipped });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo actualizar la publicación de los productos.",
        ),
      },
      { status: 400 },
    );
  }
}
