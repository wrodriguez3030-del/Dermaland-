import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_LINES, MAX_QTY_PER_LINE } from "@/features/storefront/cart";
import { toLocalPhoneDigits } from "@/features/storefront/phone";
import { createWebOrder } from "@/server/services/storefront/orders";
import { rememberCustomer } from "@/server/services/storefront/returning-customer";
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
  fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
  // El método NO decide si está pagado: eso lo decide un comprobante aceptado.
  paymentMethod: z.enum(["efectivo", "transferencia"]).default("efectivo"),
  // `.nullish()` y no `.optional()`: `FormData.get()` de un campo que no está
  // en el DOM devuelve **null**, y `JSON.stringify` conserva el null (solo
  // omite `undefined`). Una frontera pública tiene que tolerar el null de
  // cualquier llamador, no solo el `undefined` que manda nuestro formulario.
  branchSlug: z.string().max(120).nullish(),
  // La provincia sí; el COSTE del envío no. Lo calcula el servidor contra las
  // tarifas guardadas: si el importe viajara aquí, cambiarlo con la consola
  // sería elegir cuánto se paga de flete.
  province: z.string().max(120).nullish(),
  sector: z.string().max(120).nullish(),
  address: z.string().max(300).nullish(),
  reference: z.string().max(300).nullish(),
  contactName: z.string().trim().min(1).max(120),
  // MISMA regla que la máscara de la interfaz. Antes exigía exactamente 10
  // dígitos y un "+1 809-555-1234" —que es lo que produce la máscara del
  // sistema— tiene 11: el pedido se rechazaba y el cliente no sabía por qué.
  contactPhone: z
    .string()
    .transform((v) => toLocalPhoneDigits(v))
    .refine((v): v is string => v !== null, "Escribe un teléfono de 10 dígitos."),
  // Unión explícita en vez de `.email().optional().or(z.literal(""))`: aquella
  // funcionaba para "" por el orden de evaluación, y reventaba con null.
  contactEmail: z
    .union([z.literal(""), z.string().trim().email().max(200)])
    .nullish(),
  notes: z.string().trim().max(500).nullish(),
  idempotencyKey: z.string().uuid(),
});

/** Un problema a la vez y en cristiano, como ya hace `parseDeliveryAddress`. */
const MENSAJES: Record<string, string> = {
  items: "Tu carrito está vacío o tiene algo que ya no está disponible.",
  contactName: "Escribe tu nombre y apellido.",
  contactPhone: "Escribe un teléfono de 10 dígitos.",
  contactEmail: "Ese correo no parece válido.",
  branchSlug: "Elige la sucursal donde retiras.",
  province: "Elige tu provincia.",
  sector: "Escribe tu sector.",
  address: "Escribe tu dirección.",
  notes: "La nota es demasiado larga.",
  idempotencyKey: "Recarga la página e inténtalo de nuevo.",
};

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
    // Un mensaje que le diga a la persona QUÉ arreglar. "Revisa los datos"
    // sobre un formulario es no decir nada, y fue lo que impidió diagnosticar
    // este fallo desde el reporte del cliente.
    //
    // NO se devuelve el error de zod crudo: filtraría la forma del esquema y
    // mensajes internos. Se mapea el primer problema a una frase de negocio.
    const campo = String(parseado.error.issues[0]?.path[0] ?? "");
    return NextResponse.json(
      { error: MENSAJES[campo] ?? "Revisa los datos del pedido." },
      { status: 422 },
    );
  }

  const d = parseado.data;
  const resultado = await createWebOrder({
    items: d.items,
    fulfillment: d.fulfillment,
    paymentMethod: d.paymentMethod,
    idempotencyKey: d.idempotencyKey,
    contactName: d.contactName,
    contactPhone: d.contactPhone,
    // `?? undefined` en TODOS: el servicio no tiene por qué saber que del
    // navegador puede llegar `null`.
    contactEmail: d.contactEmail ? d.contactEmail : undefined,
    branchSlug: d.branchSlug ?? undefined,
    province: d.province ?? undefined,
    sector: d.sector ?? undefined,
    address: d.address ?? undefined,
    reference: d.reference ?? undefined,
    notes: d.notes ?? undefined,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 422 });
  }

  // Este dispositivo ya compró: la próxima vez no reescribe sus datos. Es una
  // galleta firmada que apunta a este pedido, sin datos personales dentro.
  await rememberCustomer(tenant.businessId, resultado.id);

  return NextResponse.json(
    { number: resultado.number, token: resultado.token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
