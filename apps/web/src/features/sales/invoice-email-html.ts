import type { Business, Proforma } from "@/types";
import {
  classifySaleDocument,
  getDocumentDisplayInfo,
} from "@/features/sales/document-label";
import { formatCurrency } from "@/lib/utils/format";

const BRAND = "#7E8A6E";

/**
 * HTML del correo de factura — mismo branding que la tarjeta de WhatsApp:
 * encabezado con logo, saludo, documento + total y un botón para ver la factura
 * y descargar el PDF (enlace público `/factura/[token]`, sin login).
 *
 * A diferencia de WhatsApp (donde los detalles van en la tarjeta OG), el correo
 * ES la presentación, así que incluye tipo de documento, número y total.
 * Estilos EN LÍNEA y estructura con tablas para compatibilidad con clientes de
 * correo (Gmail/Outlook/Apple Mail).
 */
export function buildInvoiceEmailHtml(
  p: Proforma,
  business: Business,
  opts: { viewUrl: string; logoUrl: string },
): string {
  const cls = classifySaleDocument(p);
  const doc = getDocumentDisplayInfo(p);
  const cliente = escapeHtml(p.customerName || "cliente");
  const comercio = escapeHtml(business.commercialName || "DermaLand");
  const total = formatCurrency(p.total);
  const numero = escapeHtml(doc.number);
  const titulo = escapeHtml(doc.title);

  const greeting =
    cls === "ncf"
      ? `Gracias por su compra en ${comercio}. Aquí está su factura:`
      : cls === "proforma"
        ? `Le compartimos su proforma de ${comercio}:`
        : `Le compartimos su comprobante de ${comercio}:`;

  const note =
    cls === "proforma"
      ? "Esta proforma no tiene validez fiscal hasta ser facturada."
      : cls === "ecf"
        ? "Documento demo, sin validez fiscal ante la DGII."
        : "";

  const slogan = business.slogan ? ` · ${escapeHtml(business.slogan)}` : "";

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f7f4;font-family:Arial,Helvetica,sans-serif;color:#2b2f26;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f4;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#ffffff;border:1px solid #eceee8;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${BRAND};padding:18px 24px;">
          <img src="${opts.logoUrl}" width="40" height="40" alt="${comercio}" style="vertical-align:middle;border-radius:8px;background:#ffffff;" />
          <span style="color:#ffffff;font-size:20px;font-weight:bold;vertical-align:middle;margin-left:12px;">${comercio}</span>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 10px;font-size:15px;">Hola ${cliente},</p>
          <p style="margin:0 0 18px;font-size:15px;">${greeting}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eceee8;border-radius:12px;">
            <tr><td style="padding:16px;">
              <div style="font-size:15px;font-weight:bold;">${titulo} ${numero}</div>
              <div style="font-size:22px;font-weight:bold;color:${BRAND};margin-top:6px;">Total: ${total}</div>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
            <tr><td align="center">
              <a href="${opts.viewUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:12px;font-size:15px;">Ver factura y descargar PDF</a>
            </td></tr>
          </table>
          ${note ? `<p style="margin:18px 0 0;font-size:12px;color:#8a8f80;">${note}</p>` : ""}
        </td></tr>
      </table>
      <p style="font-size:12px;color:#8a8f80;margin:16px 0 0;">${comercio}${slogan}</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
