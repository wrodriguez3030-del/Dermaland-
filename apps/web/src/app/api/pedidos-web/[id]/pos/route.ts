import { NextResponse } from "next/server";
import { WEB_ORDER_MANAGE_ROLES } from "@/features/billing/permissions";
import { authorizeRole } from "@/server/auth/require-role";
import { sessionToRepoContext } from "@/server/auth/context";
import { getWebOrderForPos } from "@/server/services/storefront/orders";

/**
 * El pedido, con lo justo para que el POS lo cargue solo.
 *
 * Exige rol igual que las mutaciones (DL-01: la RLS valida el `business_id`, no
 * el rol). Podría parecer una lectura inocente, pero devuelve el nombre del
 * cliente y su ficha del ERP.
 *
 * Sin importes: el POS pone los precios de su catálogo. Copiar aquí los del
 * pedido —de hace días— dejaría una factura con cifras que no salen de ningún
 * sitio comprobable.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeRole(WEB_ORDER_MANAGE_ROLES);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const ctx = sessionToRepoContext(auth.session);
  const pedido = await getWebOrderForPos(ctx.businessId, id);
  if (!pedido) {
    return NextResponse.json(
      { error: "Pedido no encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json(pedido, {
    headers: { "Cache-Control": "no-store" },
  });
}
