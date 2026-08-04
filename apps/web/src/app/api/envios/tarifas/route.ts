import { NextResponse } from "next/server";
import { z } from "zod";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";
import { DR_PROVINCES } from "@/features/storefront/shipping/provinces";
import { sessionToRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepositories } from "@/server/repositories";
import { saveShippingRates } from "@/server/services/storefront/shipping";

/**
 * Guardar las tarifas de envío.
 *
 * Solo ADMIN: decidir a qué provincias se llega y por cuánto es una decisión de
 * negocio con consecuencias en el margen de cada pedido, no una preferencia de
 * pantalla. La RLS valida `business_id`, **no el rol** (DL-01), así que el rol se
 * comprueba aquí.
 */

export const dynamic = "force-dynamic";

const CuerpoSchema = z.object({
  rates: z
    .array(
      z.object({
        provinceSlug: z.string().min(1),
        // Tope alto pero finito: un dedo pegado no puede fijar un flete de
        // siete cifras sin que nadie lo note.
        cost: z.number().min(0).max(100000),
        active: z.boolean(),
      }),
    )
    .min(1)
    .max(DR_PROVINCES.length),
});

export async function POST(request: Request) {
  const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
  if (!auth.ok) return auth.res;

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parseado = CuerpoSchema.safeParse(cuerpo);
  if (!parseado.success) {
    return NextResponse.json({ error: "Tarifas inválidas" }, { status: 422 });
  }

  const ctx = sessionToRepoContext(auth.session);
  const res = await saveShippingRates(
    ctx.businessId,
    ctx.userId,
    parseado.data.rates,
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });

  const activas = parseado.data.rates.filter((r) => r.active).length;
  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action: "shipping.rates_update",
    entity: "shipping_rates",
    entityId: ctx.businessId,
    // Etiquetas legibles, no claves: quien lea esto en seis meses tiene que
    // entenderlo sin abrir el código.
    metadata: {
      provincias_guardadas: res.saved,
      provincias_con_envio: activas,
    },
  });

  return NextResponse.json(
    { ok: true, saved: res.saved },
    { headers: { "Cache-Control": "no-store" } },
  );
}
