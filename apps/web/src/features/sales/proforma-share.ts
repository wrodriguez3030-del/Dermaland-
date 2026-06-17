import type { Business, Proforma } from "@/types";
import { formatCurrency } from "@/lib/utils/format";

/**
 * Helpers puros para compartir / etiquetar proformas y facturas emitidas.
 *
 * Independientes de React y del DOM para poder testearlos en entorno node.
 * Aquí NO se toca nada de DGII real ni producción fiscal: sólo se arma texto
 * y enlaces seguros (sin URLs que den 404).
 */

/** Etiqueta legible del documento según `documentKind` / `ecfType`. */
export function proformaDocLabel(p: Proforma): string {
  if (p.documentKind === "invoice") {
    return p.ecfType === "31"
      ? "Factura de Crédito Fiscal (e-CF 31)"
      : "Factura de Consumo (e-CF 32)";
  }
  return "Proforma";
}

/**
 * Un documento es DEMO / sin validez fiscal mientras no haya sido convertido a
 * e-CF real. Hoy el módulo DGII está en demo, así que casi todo es DEMO.
 */
export function isDemoDocument(p: Proforma): boolean {
  return p.status !== "converted_to_ecf";
}

/** Mensaje de WhatsApp para enviar el comprobante al cliente. */
export function buildWhatsappMessage(p: Proforma, business: Business): string {
  const lines = [
    `Hola ${p.customerName}, gracias por su compra en ${business.commercialName}.`,
    `${proformaDocLabel(p)}: ${p.number}`,
    `Total: ${formatCurrency(p.total)}`,
  ];
  if (business.rnc) lines.push(`RNC ${business.rnc}`);
  if (business.whatsapp) lines.push(`WhatsApp ${business.whatsapp}`);
  if (business.instagramUrl) lines.push("Instagram @dermalandrd");
  return lines.join("\n");
}

/**
 * Enlace `https://wa.me/...` válido para compartir el comprobante.
 *
 * - Si el cliente tiene teléfono, se prerellena el destinatario.
 * - Si no, se devuelve `wa.me/?text=...` (WhatsApp pide elegir contacto).
 *
 * NUNCA incluye una URL de la app (que requeriría sesión y podría dar 404):
 * el mensaje viaja autocontenido con los datos del comprobante.
 */
export function buildWhatsappShareUrl(p: Proforma, business: Business): string {
  const digits = (p.customerPhone ?? "").replace(/\D/g, "");
  const text = encodeURIComponent(buildWhatsappMessage(p, business));
  return `https://wa.me/${digits}?text=${text}`;
}
