import { NextResponse } from "next/server";
import { WEB_ORDER_MANAGE_ROLES } from "@/features/billing/permissions";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepositories } from "@/server/repositories";
import { sessionToRepoContext } from "@/server/auth/context";
import { getWebOrderForBusiness } from "@/server/services/storefront/orders";
import { notifyOrderPaymentLink } from "@/server/services/storefront/order-notify";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * (Re)enviar por correo el aviso "tu enlace de pago está listo".
 *
 * El aviso automático sale al pegar el enlace; este botón existe para cuando
 * el cliente no lo vio, el correo falló, o el enlace se reemplazó. Exige que
 * el pedido TENGA enlace: mandar a pagar a una página que dice "estamos
 * preparando tu enlace" sería mandar a nadie.
 *
 * Misma casa que `/estado` y `/azul-link`: fuera de `/api/storefront`
 * (público), con sesión del negocio y rol.
 */

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeRole(WEB_ORDER_MANAGE_ROLES);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const ctx = sessionToRepoContext(auth.session);

  const pedido = await getWebOrderForBusiness(ctx.businessId, id);
  if (!pedido) {
    return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
  }
  if (!pedido.azulPaymentLinkUrl) {
    return NextResponse.json(
      { error: "Este pedido no tiene enlace de pago todavía." },
      { status: 422 },
    );
  }
  if (!pedido.contactEmail) {
    return NextResponse.json(
      { error: "Este pedido no tiene correo." },
      { status: 422 },
    );
  }

  const tenant = await resolveStorefrontTenant();
  const r = await notifyOrderPaymentLink({
    businessId: ctx.businessId,
    orderId: id,
    orderNumber: pedido.number,
    contactEmail: pedido.contactEmail,
    siteName: tenant?.siteName ?? "DermaLand",
  });

  // Auditoría con etiquetas legibles, salga bien o mal: reintentar un correo
  // también es una acción que alguien querrá reconstruir.
  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action: "web_order.azul_link_notice",
    entity: "web_order",
    entityId: id,
    metadata: {
      pedido: pedido.number,
      correo: pedido.contactEmail,
      resultado: r.sent ? "enviado" : r.reason,
    },
  });

  if (!r.sent) {
    const motivo =
      r.reason === "sin-configurar"
        ? "El correo del negocio no está configurado (Ajustes → Correo)."
        : "No se pudo enviar el correo. Inténtalo de nuevo.";
    return NextResponse.json({ error: motivo }, { status: 422 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
