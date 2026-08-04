import { NextResponse } from "next/server";
import { z } from "zod";
import { WEB_ORDER_MANAGE_ROLES } from "@/features/billing/permissions";
import {
  WEB_ORDER_STATUSES,
  webOrderStatusLabel,
} from "@/features/storefront/orders/status";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepositories } from "@/server/repositories";
import { sessionToRepoContext } from "@/server/auth/context";
import { advanceWebOrder } from "@/server/services/storefront/orders";

/**
 * Cambiar el estado de un pedido.
 *
 * Vive FUERA de `/api/storefront` a propósito: ese prefijo es público (lo usan
 * el carrito y el alta de pedido, que no tienen sesión), y una ruta de mutación
 * ahí debajo quedaría abierta a internet por el match por segmento. Aquí exige
 * sesión del negocio (portero del middleware) **y** rol (DL-01: la RLS valida
 * `business_id`, no el rol).
 *
 * La transición la vuelve a validar el servicio: el servidor no se fía de que
 * el botón que llegó sea uno de los que él pintó.
 */

export const dynamic = "force-dynamic";

const CuerpoSchema = z.object({
  status: z.enum(WEB_ORDER_STATUSES),
  reason: z.string().trim().max(300).optional(),
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
    return NextResponse.json({ error: "Estado inválido" }, { status: 422 });
  }

  const ctx = sessionToRepoContext(auth.session);
  const res = await advanceWebOrder(
    ctx.businessId,
    id,
    parseado.data.status,
    parseado.data.reason,
  );
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 422 });
  }

  // Auditoría con ETIQUETAS LEGIBLES, no claves: quien lea el registro dentro
  // de seis meses no tiene por qué saber qué significa "listo".
  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action: "web_order.status_change",
    entity: "web_order",
    entityId: id,
    metadata: {
      de: res.from ? webOrderStatusLabel(res.from) : undefined,
      a: webOrderStatusLabel(parseado.data.status),
      motivo: parseado.data.reason,
    },
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
