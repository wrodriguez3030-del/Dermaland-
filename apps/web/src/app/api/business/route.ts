import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { parseJsonBody } from "@/server/http/parse-body";
import { getRepositories } from "@/server/repositories";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";

/**
 * Datos de la empresa.
 *
 * Solo administradores: de aquí salen el RNC y la razón social que se imprimen
 * en cada comprobante fiscal. Cambiarlos por error no rompe la aplicación, sino
 * los documentos ya emitidos y los que emitan mañana.
 *
 * Lo que NO se toca desde aquí, a propósito: `dgiiEnabled`, `planId` y `status`.
 * Son decisiones de plataforma —facturación del SaaS y habilitación fiscal— y
 * viven en Súper Admin. Que el esquema de abajo sea una lista blanca es la
 * garantía: aunque alguien los mande en el cuerpo, no llegan al repositorio.
 */
export const dynamic = "force-dynamic";

/** Un texto opcional que se vacía a `null`, no a cadena vacía. */
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null))
    .nullable()
    .optional();

const businessSchema = z.object({
  commercialName: z.string().trim().min(1).max(120).optional(),
  legalName: z.string().trim().min(1).max(160).optional(),
  // El RNC dominicano tiene 9 dígitos y la cédula 11. No se valida el formato
  // aquí porque este campo también recibe RNC extranjeros en negocios que
  // facturan fuera; la validación fiscal vive en el módulo DGII.
  rnc: z.string().trim().max(20).optional(),
  phone: opcional(30),
  whatsapp: opcional(30),
  email: z.string().trim().max(120).email().nullable().optional().or(z.literal("")),
  instagramUrl: opcional(300),
  website: opcional(500),
  address: opcional(300),
  city: opcional(120),
  province: opcional(120),
  slogan: opcional(160),
  description: opcional(2000),
});

function noSupabase() {
  return NextResponse.json(
    {
      error:
        "Los datos de la empresa necesitan Supabase activo (DATA_SOURCE=supabase).",
    },
    { status: 409 },
  );
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return noSupabase();
  try {
    const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
    if (!auth.ok) return auth.res;
    const parsed = await parseJsonBody(req, businessSchema);
    if (!parsed.ok) return parsed.res;

    const ctx = await getRepoContext();
    const business = await getRepositories().business.update(ctx, {
      ...parsed.data,
      // `email` acepta `""` en el esquema (el `.or(z.literal(""))` que exige el
      // campo vacío del formulario) y aquí se normaliza a `null`, para no
      // guardar una cadena vacía donde la columna admite ausencia.
      ...(parsed.data.email !== undefined
        ? { email: parsed.data.email || null }
        : {}),
    });

    // Queda registro de quién cambió el RNC o la razón social. Son los datos
    // que aparecen en cada comprobante fiscal.
    await getRepositories().audit.log(ctx, {
      businessId: ctx.businessId,
      userId: ctx.userId ?? "",
      userName: ctx.userName ?? "",
      action: "business.updated",
      entity: "business",
      entityId: ctx.businessId,
      metadata: parsed.data as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ business });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudieron guardar los datos de la empresa.",
        ),
      },
      { status: 400 },
    );
  }
}
