// El WhatsApp con el que el cliente manda su pedido.
//
// Mientras no exista el pedido de verdad (F3.3), este mensaje ES la venta: si
// sale mal —sin importes, sin enlaces, con el total de otro carrito— el
// vendedor no tiene forma de saberlo y la venta se pierde en silencio. Por eso
// es una función pura y probada, igual que `productInquiryMessage`.
//
// Solo hay RETIRO EN SUCURSAL (decisión del dueño, 2026-08-04): el mensaje
// nombra dónde recoge el cliente, y nunca pide ni menciona una dirección.

import { formatCurrency } from "@/lib/utils/format";
import type { CartSummary } from "./cart";
import type { PublicBranch } from "./types";

export function cartInquiryMessage({
  summary,
  branch,
  baseUrl,
}: {
  summary: CartSummary;
  /** Sucursal de retiro. No hay envío a domicilio. */
  branch: PublicBranch | undefined;
  baseUrl: string;
}): string {
  // Un carrito vacío devuelve cadena vacía para que quien llama pueda NO pintar
  // el botón, en vez de abrir WhatsApp con un pedido en blanco.
  if (summary.lines.length === 0) return "";

  const encabezado = branch
    ? `Hola, quiero hacer este pedido para retirar en ${branch.name}:`
    : "Hola, quiero hacer este pedido:";

  // El enlace de cada ficha va debajo del nombre: dos productos de la misma
  // marca pueden llamarse casi igual, y quien atiende necesita saber cuál es sin
  // preguntar.
  const lineas = summary.lines.map(
    (l) =>
      `• ${l.qty} × ${l.product.title} — ${formatCurrency(l.lineTotal)}\n  ${baseUrl}/tienda/producto/${l.product.slug}`,
  );

  return [
    encabezado,
    "",
    ...lineas,
    "",
    `Total: ${formatCurrency(summary.total)}`,
  ].join("\n");
}
