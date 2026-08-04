import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CATALOG_MANAGE_ROLES } from "@/features/billing/permissions";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { parseJsonBody } from "@/server/http/parse-body";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { updateProductWebMeta } from "@/server/services/storefront/admin";

/**
 * Ficha web de un producto: publicar, destacar y redactar el contenido.
 *
 * `CATALOG_MANAGE_ROLES` (admin y encargado) porque es trabajo de catálogo, no
 * de configuración del negocio. Encender la tienda entera vive en otra ruta y
 * exige ser administrador.
 */
export const dynamic = "force-dynamic";

const metaSchema = z.object({
  visible: z.boolean().optional(),
  featured: z.boolean().optional(),
  isNew: z.boolean().optional(),
  webTitle: z.string().trim().max(160).nullable().optional(),
  webSummary: z.string().trim().max(300).nullable().optional(),
  webDescription: z.string().trim().max(4000).nullable().optional(),
  benefits: z.array(z.string().trim().max(120)).max(8).optional(),
  howToUse: z.string().trim().max(2000).nullable().optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(160).nullable().optional(),
  imageAlt: z.string().trim().max(160).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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
    const parsed = await parseJsonBody(req, metaSchema);
    if (!parsed.ok) return parsed.res;

    const { id } = await params;
    const ctx = await getRepoContext();
    const resultado = await updateProductWebMeta(ctx, id, parsed.data);

    if (!resultado.ok) {
      // 422 y no 400: la petición está bien formada, es el producto el que aún
      // no puede publicarse. Los motivos van en texto para enseñarlos tal cual.
      return NextResponse.json(
        {
          error: `No se puede publicar: ${resultado.blockers.join(". ")}.`,
          blockers: resultado.blockers,
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo guardar la ficha web del producto.",
        ),
      },
      { status: 400 },
    );
  }
}
