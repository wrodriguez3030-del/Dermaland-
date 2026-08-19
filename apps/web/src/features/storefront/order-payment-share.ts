import { normalizeWhatsappPhone } from "@/features/sales/proforma-share";

/**
 * Mensaje y enlace `wa.me` para mandarle al cliente el aviso de "ya puedes
 * pagar tu pedido con tarjeta".
 *
 * Helpers puros, sin React ni DOM, igual que `proforma-share.ts`. El enlace
 * que se comparte es el de LA PÁGINA DEL PEDIDO (token firmado) — nunca el de
 * Azul a secas: la página trae el monto para verificar, el botón de pagar y el
 * subidor de comprobante.
 */

export interface OrderPaymentShareInput {
  /** Nombre del contacto del pedido; vacío = saludo a secas. */
  contactName: string;
  /** Número visible del pedido (WEB-…). */
  orderNumber: string;
  /** Nombre del comercio, para que el mensaje diga de quién viene. */
  siteName: string;
  /** URL pública del pedido (con su token firmado). */
  url: string;
}

/** Mensaje mínimo: saludo + enlace en su propia línea (así WhatsApp lo pinta
 *  con su tarjeta de vista previa) + una sola aclaración. */
export function buildOrderPaymentWhatsappMessage(
  input: OrderPaymentShareInput,
): string {
  const nombre = input.contactName.trim();
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";
  return [
    `${saludo} ya puedes pagar tu pedido ${input.orderNumber} de ${input.siteName} con tarjeta:`,
    "",
    input.url,
    "",
    "El enlace lleva el monto exacto de tu compra.",
  ].join("\n");
}

/**
 * Enlace `https://wa.me/...` listo para abrir.
 *
 * Sin teléfono usable devuelve `wa.me/?text=...` (WhatsApp pide elegir el
 * contacto) — la pantalla debería avisar antes de que falta el teléfono.
 */
export function buildOrderPaymentWhatsappUrl(
  input: OrderPaymentShareInput & { contactPhone: string | null | undefined },
): string {
  const phone = normalizeWhatsappPhone(input.contactPhone) ?? "";
  const text = encodeURIComponent(buildOrderPaymentWhatsappMessage(input));
  return `https://wa.me/${phone}?text=${text}`;
}
