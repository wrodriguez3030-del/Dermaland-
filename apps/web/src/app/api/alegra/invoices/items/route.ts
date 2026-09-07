import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { ALEGRA_READ_ROLES } from "@/features/alegra/roles";
import { lineasDeFacturas } from "@/server/services/alegra/queries";

export const dynamic = "force-dynamic";

const querySchema = z.object({ invoiceId: z.string().uuid() });

/**
 * Qué llevaba una factura migrada de Alegra.
 *
 * Hasta ahora el histórico se podía ver por fuera —fecha, comprobante, total—
 * pero no por dentro: al hacer clic en una compra no había nada que abrir. Para
 * atender a un cliente que pregunta «¿qué me llevé la última vez?» hace falta
 * el renglón, no el total.
 *
 * SOLO LECTURA, como todo lo que toca `alegra_invoices`. Mismo permiso que el
 * resto del histórico: quien puede ver la factura puede ver lo que llevaba.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const auth = await authorizeRole(ALEGRA_READ_ROLES);
  if (!auth.ok) return auth.res;

  const parsed = querySchema.safeParse({
    invoiceId: req.nextUrl.searchParams.get("invoiceId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta la factura o no es válida." }, { status: 400 });
  }

  try {
    const ctx = await getRepoContext();
    // `lineasDeFacturas` filtra por `business_id` del contexto —del JWT, no de
    // quien llama—, así que pedir la factura de otro negocio no devuelve nada.
    const items = await lineasDeFacturas(ctx, [parsed.data.invoiceId]);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar el detalle de la factura.") },
      { status: 400 },
    );
  }
}
