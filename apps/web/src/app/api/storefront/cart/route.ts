import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildCartSummary,
  MAX_LINES,
  MAX_QTY_PER_LINE,
  parseCartItems,
} from "@/features/storefront/cart";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * Resuelve un carrito: el navegador manda QUÉ y esta ruta responde CUÁNTO.
 *
 * Es pública a propósito —la tienda no tiene sesión— y por eso está acotada al
 * mínimo: solo LEE el catálogo ya publicado (el mismo cacheado que sirve las
 * páginas), no escribe nada, no toca clientes ni ventas, y con la tienda apagada
 * devuelve 404 igual que el resto de `/tienda`.
 *
 * El cuerpo lo escribe un desconocido: el esquema pone tope al número de líneas
 * y a la cantidad por línea ANTES de que nada llegue al motor.
 *
 * Es también la razón de existir del carrito: si el navegador calculara el
 * total, cambiar un precio con la consola cambiaría lo que se cobra.
 */

const CuerpoSchema = z.object({
  items: z
    .array(
      z.object({
        slug: z.string().min(1).max(200),
        qty: z.number().int().min(1).max(MAX_QTY_PER_LINE),
      }),
    )
    .max(MAX_LINES),
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
    return NextResponse.json({ error: "Carrito inválido" }, { status: 422 });
  }

  const { products } = await loadPublishedCatalog(tenant.businessId);
  // Se vuelve a pasar por `parseCartItems` aunque zod ya validó: es el mismo
  // saneado que aplica el navegador (fusiona repetidos, recorta topes), y así el
  // total no depende de por dónde entró el carrito.
  const summary = buildCartSummary(
    parseCartItems(parseado.data.items),
    products,
  );

  return NextResponse.json(summary, {
    // Precio y disponibilidad cambian; que un intermediario cachee este cuerpo
    // sería servirle a un cliente el carrito de otro momento.
    headers: { "Cache-Control": "no-store" },
  });
}
