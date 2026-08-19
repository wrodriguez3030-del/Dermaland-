import { NextResponse } from "next/server";
import { z } from "zod";
import { WEB_ORDER_MANAGE_ROLES } from "@/features/billing/permissions";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepositories } from "@/server/repositories";
import { sessionToRepoContext } from "@/server/auth/context";
import { setWebOrderAzulLink } from "@/server/services/storefront/orders";
import { notifyOrderPaymentLink } from "@/server/services/storefront/order-notify";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * Poner (o quitar: url vacía) el enlace de Azul DE UN PEDIDO.
 *
 * Vive FUERA de `/api/storefront` a propósito, igual que `/estado`: ese
 * prefijo es público y una ruta de mutación ahí debajo quedaría abierta a
 * internet. Aquí exige sesión del negocio **y** rol.
 *
 * El dominio del enlace y la regla de qué pedido lo admite se vuelven a
 * validar en el servicio: el servidor no se fía del formulario.
 */

export const dynamic = "force-dynamic";

const CuerpoSchema = z.object({
  url: z.string().trim().max(500),
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
    return NextResponse.json({ error: "Enlace inválido" }, { status: 422 });
  }

  const ctx = sessionToRepoContext(auth.session);
  const res = await setWebOrderAzulLink(ctx.businessId, id, parseado.data.url);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 422 });
  }

  // Avisar al cliente de que ya puede pagar. Solo cuando se PONE un enlace:
  // quitarlo es mantenimiento interno y no le aporta nada. Un fallo del correo
  // no deshace el guardado: se registra en la auditoría y se sigue.
  let aviso = "sin-aviso";
  if (res.url) {
    try {
      const tenant = await resolveStorefrontTenant();
      const r = await notifyOrderPaymentLink({
        businessId: ctx.businessId,
        orderId: id,
        orderNumber: res.number,
        contactEmail: res.contactEmail,
        siteName: tenant?.siteName ?? "DermaLand",
      });
      aviso = r.sent ? "enviado" : r.reason;
    } catch {
      aviso = "error";
    }
  }

  // Auditoría con ETIQUETAS LEGIBLES: quien la lea dentro de seis meses tiene
  // que entender qué pasó sin descifrar claves.
  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action: "web_order.azul_link_set",
    entity: "web_order",
    entityId: id,
    metadata: {
      pedido: res.number,
      enlace: res.url ?? "borrado",
      aviso_al_cliente: aviso,
    },
  });

  return NextResponse.json(
    { ok: true, aviso },
    { headers: { "Cache-Control": "no-store" } },
  );
}
