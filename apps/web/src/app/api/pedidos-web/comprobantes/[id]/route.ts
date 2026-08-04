import { NextResponse } from "next/server";
import { z } from "zod";
import { WEB_ORDER_MANAGE_ROLES } from "@/features/billing/permissions";
import { sessionToRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepositories } from "@/server/repositories";
import { reviewReceipt } from "@/server/services/storefront/transfer-payments";

/**
 * Aceptar o rechazar un comprobante de transferencia.
 *
 * Aceptar es lo que marca el pedido como **pagado**, y es la ÚNICA forma de
 * hacerlo: no existe un botón de "marcar pagado" suelto. Es lo que hace que el
 * estado de pago signifique algo — detrás de cada pedido pagado hay un
 * documento que alguien miró.
 *
 * Fuera del prefijo público `/api/storefront`: esto es del negocio y exige
 * sesión y rol (la RLS valida el tenant, no el rol — DL-01).
 */

export const dynamic = "force-dynamic";

const CuerpoSchema = z.object({
  decision: z.enum(["aceptado", "rechazado"]),
  note: z.string().trim().max(300).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeRole(WEB_ORDER_MANAGE_ROLES);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parseado = CuerpoSchema.safeParse(cuerpo);
  if (!parseado.success) {
    return NextResponse.json({ error: "Decisión inválida" }, { status: 422 });
  }

  const ctx = sessionToRepoContext(auth.session);
  const res = await reviewReceipt(
    ctx.businessId,
    id,
    parseado.data.decision,
    ctx.userId,
    parseado.data.note,
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });

  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action: "web_order.receipt_review",
    entity: "web_order_receipt",
    entityId: id,
    // Legible: quien lo lea en seis meses no tiene por qué saber qué es
    // "aceptado" en el esquema.
    metadata: {
      decision:
        parseado.data.decision === "aceptado"
          ? "Comprobante aceptado — pedido marcado como PAGADO"
          : "Comprobante rechazado",
      nota: parseado.data.note,
      pedido: res.orderId,
    },
  });

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
