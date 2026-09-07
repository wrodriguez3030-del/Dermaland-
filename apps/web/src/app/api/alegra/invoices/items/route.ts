import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { ALEGRA_READ_ROLES } from "@/features/alegra/roles";
import { lineasDeFacturas } from "@/server/services/alegra/queries";

export const dynamic = "force-dynamic";

/**
 * Tope de facturas por petición. La ficha del cliente pide los ítems de las
 * compras que tiene EN PANTALLA (una página del listado), nunca del histórico
 * entero: 50 le sobran. Sin tope, un `in` con cientos de ids revienta la URL
 * — el mismo motivo por el que `lineasDeFacturas` pide por tandas de 200.
 */
const TOPE_FACTURAS = 50;

/**
 * Se acepta `invoiceId` (una) o `invoiceIds` (varias, separadas por coma). La
 * primera se conserva porque ya hay quien la usa; la segunda existe para pintar
 * una tabla entera sin una petición por fila.
 */
const querySchema = z
  .object({
    invoiceId: z.string().uuid().optional(),
    invoiceIds: z
      .string()
      .transform((v) => v.split(",").map((x) => x.trim()).filter(Boolean))
      .pipe(z.array(z.string().uuid()).min(1).max(TOPE_FACTURAS))
      .optional(),
  })
  .refine((q) => q.invoiceId !== undefined || q.invoiceIds !== undefined, {
    message: "Falta la factura.",
  });

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

  const uno = req.nextUrl.searchParams.get("invoiceId");
  const varias = req.nextUrl.searchParams.get("invoiceIds");
  const parsed = querySchema.safeParse({
    ...(uno !== null && { invoiceId: uno }),
    ...(varias !== null && { invoiceIds: varias }),
  });
  if (!parsed.success) {
    // 🔴 Un 400, nunca una lista vacía: en pantalla, «esta factura no llevaba
    // nada» y «la petición estaba mal» se ven igual, y una de las dos es un
    // fallo que hay que arreglar.
    return NextResponse.json(
      { error: `Falta la factura o no es válida (máximo ${TOPE_FACTURAS} por consulta).` },
      { status: 400 },
    );
  }
  const ids = parsed.data.invoiceIds ?? [parsed.data.invoiceId as string];

  try {
    const ctx = await getRepoContext();
    // `lineasDeFacturas` filtra por `business_id` del contexto —del JWT, no de
    // quien llama—, así que pedir la factura de otro negocio no devuelve nada.
    const items = await lineasDeFacturas(ctx, ids);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar el detalle de la factura.") },
      { status: 400 },
    );
  }
}
