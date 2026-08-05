import { NextResponse } from "next/server";
import { z } from "zod";
import { WEB_ORDER_MANAGE_ROLES } from "@/features/billing/permissions";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepositories } from "@/server/repositories";
import { sessionToRepoContext } from "@/server/auth/context";
import { linkProformaToWebOrder } from "@/server/services/storefront/orders";

/**
 * Enlazar el documento emitido en el POS con el pedido que lo originó.
 *
 * Se llama DESPUÉS de emitir. El pedido no puede quedar marcado como facturado
 * por una venta que luego falló; si en cambio se pierde esta llamada, lo que se
 * pierde es el enlace —molesto, se arregla— y no la factura.
 */

export const dynamic = "force-dynamic";

const CuerpoSchema = z.object({
  proformaId: z.string().uuid(),
  /** Solo para la auditoría: el número que vio el cajero. */
  documentNumber: z.string().trim().max(60).nullish(),
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
    return NextResponse.json({ error: "Documento inválido" }, { status: 422 });
  }

  const ctx = sessionToRepoContext(auth.session);
  const res = await linkProformaToWebOrder(
    ctx.businessId,
    id,
    parseado.data.proformaId,
  );
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 422 });
  }

  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action: "web_order.invoiced",
    entity: "web_order",
    entityId: id,
    metadata: {
      documento: parseado.data.documentNumber ?? undefined,
    },
  });

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
