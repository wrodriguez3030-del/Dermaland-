import { NextResponse } from "next/server";
import { z } from "zod";
import { WEB_ORDER_MANAGE_ROLES } from "@/features/billing/permissions";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepositories } from "@/server/repositories";
import { sessionToRepoContext } from "@/server/auth/context";
import { changeWebOrderFulfillment } from "@/server/services/storefront/orders";
import { provinceName } from "@/features/storefront/shipping/provinces";

/**
 * Cambiar el tipo de entrega de un pedido.
 *
 * Vive fuera de `/api/storefront` por la misma razón que la ruta de estado: ese
 * prefijo es público y una mutación ahí debajo quedaría abierta a internet.
 * Aquí exige sesión (portero del middleware) **y** rol — la RLS valida el
 * `business_id`, no el rol (DL-01).
 *
 * El cuerpo trae el DESTINO, nunca el precio: el flete lo recalcula el servicio
 * con las tarifas vigentes.
 */

export const dynamic = "force-dynamic";

const CuerpoSchema = z.discriminatedUnion("to", [
  z.object({
    to: z.literal("pickup"),
    branchId: z.string().uuid(),
  }),
  z.object({
    to: z.literal("delivery"),
    branchId: z.string().uuid(),
    province: z.string().trim().min(1),
    sector: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(300),
    // `.nullish()`: del navegador puede llegar `null` para un campo vacío, y
    // `.optional()` lo rechazaría. Es el fallo que dejó el checkout sin poder
    // registrar un solo pedido.
    reference: z.string().trim().max(300).nullish(),
  }),
]);

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
    return NextResponse.json(
      { error: "Faltan datos de la entrega." },
      { status: 422 },
    );
  }

  const ctx = sessionToRepoContext(auth.session);
  const d = parseado.data;
  const res = await changeWebOrderFulfillment(
    ctx.businessId,
    id,
    d.to === "pickup"
      ? { to: "pickup", branchId: d.branchId }
      : {
          to: "delivery",
          branchId: d.branchId,
          province: d.province,
          sector: d.sector,
          address: d.address,
          reference: d.reference ?? undefined,
        },
  );
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 422 });
  }

  // Auditoría con ETIQUETAS LEGIBLES, no claves: quien lea esto dentro de seis
  // meses no tiene por qué saber qué significa "pickup".
  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action: "web_order.fulfillment_change",
    entity: "web_order",
    entityId: id,
    metadata: {
      de: res.from === "delivery" ? "Envío a domicilio" : "Retiro en sucursal",
      a: d.to === "delivery" ? "Envío a domicilio" : "Retiro en sucursal",
      provincia:
        d.to === "delivery" ? (provinceName(d.province) ?? d.province) : undefined,
      flete: res.shippingCost,
      total: res.total,
    },
  });

  return NextResponse.json(
    { ok: true, shippingCost: res.shippingCost, total: res.total },
    { headers: { "Cache-Control": "no-store" } },
  );
}
