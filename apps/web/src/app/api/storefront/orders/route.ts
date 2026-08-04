import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_LINES, MAX_QTY_PER_LINE } from "@/features/storefront/cart";
import { createWebOrder } from "@/server/services/storefront/orders";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * Alta de un pedido desde la tienda. Pública: la tienda no tiene sesión.
 *
 * Del navegador llegan slugs, cantidades y datos de contacto. **Nunca importes**:
 * el total lo calcula el servidor contra el catálogo publicado, igual que el
 * carrito. Y **nunca un `branch_id`**: sólo el slug público de la sucursal, que
 * el servidor resuelve contra las que él mismo publica — si viniera el id, un
 * visitante podría mandar el de otro negocio.
 *
 * Cambiar el ESTADO de un pedido no vive aquí debajo a propósito: eso es del
 * negocio y va en `/api/pedidos-web/...`, fuera del prefijo público.
 */

const CuerpoSchema = z.object({
  items: z
    .array(
      z.object({
        slug: z.string().min(1).max(200),
        qty: z.number().int().min(1).max(MAX_QTY_PER_LINE),
      }),
    )
    .min(1)
    .max(MAX_LINES),
  branchSlug: z.string().min(1).max(120),
  contactName: z.string().trim().min(1).max(120),
  // Dígitos: el mismo formato con el que se guarda el teléfono del cliente.
  contactPhone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 10, "Teléfono de 10 dígitos"),
  contactEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request) {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parseado = CuerpoSchema.safeParse(cuerpo);
  if (!parseado.success) {
    return NextResponse.json({ error: "Revisa los datos" }, { status: 422 });
  }

  const { contactEmail, ...resto } = parseado.data;
  const resultado = await createWebOrder({
    ...resto,
    contactEmail: contactEmail ? contactEmail : undefined,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 422 });
  }

  return NextResponse.json(
    { number: resultado.number, token: resultado.token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
