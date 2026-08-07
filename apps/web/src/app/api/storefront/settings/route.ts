import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { parseJsonBody } from "@/server/http/parse-body";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { updateStorefrontSettings } from "@/server/services/storefront/admin";

/**
 * Configuración de la tienda pública.
 *
 * Solo administradores: aquí está el interruptor que pone el catálogo entero en
 * internet. `manager` puede publicar productos (otra ruta), pero encender la
 * tienda es una decisión del dueño del negocio.
 */
export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  storefrontEnabled: z.boolean().optional(),
  siteName: z.string().trim().min(1).max(80).optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  // El límite de 160 no es un capricho: es lo que Google enseña en el
  // resultado; lo que pase de ahí se corta con puntos suspensivos.
  seoDescription: z.string().trim().max(160).nullable().optional(),
  whatsappPhone: z.string().trim().max(30).nullable().optional(),
  contactEmail: z
    .string()
    .trim()
    .email()
    .max(120)
    .nullable()
    .optional()
    .or(z.literal("")),
  // Llega ya normalizado por el formulario; el tope de 500 acompaña al CHECK
  // de la columna, para que un pegado enorme falle aquí y no en la base.
  linktreeUrl: z.string().trim().max(500).nullable().optional(),
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
    const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
    if (!auth.ok) return auth.res;
    const parsed = await parseJsonBody(req, settingsSchema);
    if (!parsed.ok) return parsed.res;

    const ctx = await getRepoContext();
    const settings = await updateStorefrontSettings(ctx, parsed.data);
    return NextResponse.json({ settings });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo guardar la configuración de la tienda.",
        ),
      },
      { status: 400 },
    );
  }
}
