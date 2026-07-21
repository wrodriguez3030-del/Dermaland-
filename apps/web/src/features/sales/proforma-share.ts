import type { Business, Proforma } from "@/types";
import { formatCurrency } from "@/lib/utils/format";
import { classifySaleDocument } from "@/features/sales/document-label";

/**
 * Helpers puros para compartir / etiquetar proformas y facturas emitidas.
 *
 * Independientes de React y del DOM para poder testearlos en entorno node.
 * Aquí NO se toca nada de DGII real ni producción fiscal: sólo se arma texto
 * y enlaces seguros (mensaje profesional + link al PDF descargable).
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

// ─── Teléfono ────────────────────────────────────────────────────────────────

/**
 * Normaliza un teléfono para WhatsApp (`wa.me`):
 *  - quita espacios, guiones, paréntesis y todo lo no numérico;
 *  - si es un número RD de 10 dígitos (809/829/849 + 7), antepone "1";
 *  - si ya trae "1" + 10 dígitos (11) se respeta;
 *  - otros formatos internacionales (>=11 dígitos) se respetan tal cual.
 *
 * Devuelve `null` si no hay un número usable (vacío o demasiado corto).
 */
export function normalizeWhatsappPhone(
  raw: string | null | undefined,
): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `1${digits}`; // RD sin código de país
  return digits; // 11+ (incluye 1XXXXXXXXXX) → tal cual
}

// ─── Nombre de archivo del PDF ───────────────────────────────────────────────

function safeFilePart(s: string): string {
  return (s || "documento").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Nombre sugerido del PDF: `Factura-B02...pdf` / `Proforma-PROF...pdf`. */
export function whatsappPdfFilename(p: Proforma): string {
  const cls = classifySaleDocument(p);
  const number = p.ecfNumber ?? p.number;
  const prefix = cls === "proforma" ? "Proforma" : "Factura";
  return `${prefix}-${safeFilePart(number)}.pdf`;
}

// ─── Mensaje de WhatsApp ──────────────────────────────────────────────────────

export interface WhatsappShareOptions {
  /** Enlace público al PDF de la factura/proforma. */
  pdfUrl?: string;
  /**
   * Número de destino (wa.me). Si se provee, tiene prioridad sobre el snapshot
   * `p.customerPhone`. Úsalo para enviar al WhatsApp VIGENTE del cliente en vez
   * del teléfono congelado al momento de la venta. Solo afecta el destino; el
   * contenido del mensaje/PDF sigue reflejando el documento.
   */
  phone?: string | null;
}

/**
 * Mensaje profesional de WhatsApp para enviar el comprobante al cliente.
 *
 * Indica claramente que se comparte la factura/proforma en PDF e incluye el
 * enlace de descarga cuando está disponible. El tono y los campos cambian según
 * el tipo de documento (factura NCF, proforma o e-CF demo).
 */
export function buildWhatsappShareMessage(
  p: Proforma,
  business: Business,
  opts: WhatsappShareOptions = {},
): string {
  const cls = classifySaleDocument(p);
  const cliente = p.customerName || "cliente";
  const total = formatCurrency(p.total);
  const comercio = business.commercialName || "DermaLand";
  const lines: string[] = [];

  if (cls === "ecf") {
    lines.push(
      `Hola ${cliente}, le compartimos su comprobante de ${comercio}.`,
      "",
      `${proformaDocLabel(p)} · ${p.ecfNumber ?? p.number}`,
      `Total: ${total}`,
    );
    if (opts.pdfUrl) lines.push("", "Ver comprobante y descargar PDF:", opts.pdfUrl);
    lines.push("", "Documento demo, sin validez fiscal ante la DGII.");
  } else if (cls === "ncf") {
    lines.push(
      `Hola ${cliente}, gracias por su compra en ${comercio}.`,
      "",
      `${saleDocLabelNcf(p)} · ${p.ecfNumber ?? p.number}`,
      `Total: ${total}`,
    );
    if (opts.pdfUrl) lines.push("", "Ver factura y descargar PDF:", opts.pdfUrl);
  } else {
    lines.push(
      `Hola ${cliente}, le compartimos su proforma de ${comercio}.`,
      "",
      `Proforma · ${p.number}`,
      `Total: ${total}`,
    );
    if (opts.pdfUrl) lines.push("", "Ver proforma:", opts.pdfUrl);
    lines.push("", "No tiene validez fiscal hasta ser facturada.");
  }

  return lines.join("\n");
}

/** Etiqueta amigable para una factura NCF en el mensaje (Consumo/Crédito). */
function saleDocLabelNcf(p: Proforma): string {
  if (p.ecfType === "31" || p.sequenceType === "credito_fiscal") {
    return "Factura de Crédito Fiscal (B01)";
  }
  return "Factura de Consumo (B02)";
}

/**
 * Compat: mensaje base (sin enlace al PDF). Se mantiene para llamadas previas;
 * el contenido ahora es el mensaje profesional.
 */
export function buildWhatsappMessage(p: Proforma, business: Business): string {
  return buildWhatsappShareMessage(p, business);
}

// ─── Correo ──────────────────────────────────────────────────────────────────

/** Asunto del correo: "Factura B0200001247 - DermaLand" / "Proforma …". */
export function buildEmailSubject(p: Proforma, business: Business): string {
  const cls = classifySaleDocument(p);
  const prefix = cls === "proforma" ? "Proforma" : "Factura";
  const comercio = business.commercialName || "DermaLand";
  return `${prefix} ${p.ecfNumber ?? p.number} - ${comercio}`;
}

/**
 * Cuerpo del correo con el tipo de documento correcto (B0x NCF nunca menciona
 * e-CF; e-CF sí; proforma = documento no fiscal) y enlace a la factura.
 */
export function buildEmailShareMessage(
  p: Proforma,
  business: Business,
  opts: WhatsappShareOptions = {},
): string {
  const cls = classifySaleDocument(p);
  const cliente = p.customerName || "cliente";
  const comercio = business.commercialName || "DermaLand";
  const total = formatCurrency(p.total);
  const lines: string[] = [`Hola ${cliente},`, ""];

  if (cls === "proforma") {
    lines.push(
      `Le compartimos su proforma de ${comercio}.`,
      "",
      `Proforma · ${p.number}`,
      `Total: ${total}`,
    );
  } else if (cls === "ncf") {
    lines.push(
      `Gracias por su compra en ${comercio}. Aquí está su factura:`,
      "",
      `${saleDocLabelNcf(p)} · ${p.ecfNumber ?? p.number}`,
      `Total: ${total}`,
    );
  } else {
    lines.push(
      `Le compartimos su comprobante de ${comercio}.`,
      "",
      `${proformaDocLabel(p)} · ${p.ecfNumber ?? p.number}`,
      `Total: ${total}`,
    );
  }

  if (opts.pdfUrl) lines.push("", "Ver y descargar su factura:", opts.pdfUrl);
  if (cls === "proforma") {
    lines.push("", "No tiene validez fiscal hasta ser facturada.");
  } else if (cls === "ecf") {
    lines.push("", "Documento demo, sin validez fiscal ante la DGII.");
  }
  lines.push("", `Saludos,`, comercio);
  return lines.join("\n");
}

/**
 * Enlace `https://wa.me/...` válido para compartir el comprobante.
 *
 * - Normaliza el teléfono del cliente (RD → +1) cuando existe.
 * - Si no hay teléfono usable, devuelve `wa.me/?text=...` (WhatsApp pide elegir
 *   contacto) — pero la UI debería avisar antes que falta el teléfono.
 * - Incluye el enlace al PDF cuando se provee en `opts.pdfUrl`.
 */
export function buildWhatsappShareUrl(
  p: Proforma,
  business: Business,
  opts: WhatsappShareOptions = {},
): string {
  const phone = normalizeWhatsappPhone(opts.phone ?? p.customerPhone) ?? "";
  const text = encodeURIComponent(buildWhatsappShareMessage(p, business, opts));
  return `https://wa.me/${phone}?text=${text}`;
}
