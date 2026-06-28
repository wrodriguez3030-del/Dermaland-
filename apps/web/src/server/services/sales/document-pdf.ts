// Generador de la representación impresa (PDF A4) de un documento de venta:
// proforma, factura NCF (B02/B01) o e-CF demo (E32/E31).
//
// Es presentación pura: produce un Buffer en memoria, sin red ni fs. NO toca
// XML, firma, secuencias ni ambiente fiscal real (DGII real sigue apagado).
// Cuando el documento no es un e-CF fiscal emitido, el pie lo marca como DEMO /
// sin validez fiscal. No imprime UUIDs ni datos técnicos.

import PDFDocument from "pdfkit";
import type { Business, Proforma } from "@/types";
import { classifySaleDocument, type SaleDocClass } from "@/features/sales/document-label";

export class SaleDocumentPdfError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(`SaleDocumentPdf: ${message}`);
    this.name = "SaleDocumentPdfError";
    this.cause = cause;
  }
}

// ── Geometría de página (A4, márgenes seguros de 50pt) ───────────────────────
const LEFT = 50;
const RIGHT = 545;
const CONTENT_W = RIGHT - LEFT; // 495
const BOTTOM = 790;
const BRAND = "#7E8A6E";
const HAIR = "#cccccc";

/** Marca DermaLand como path vectorial (mismo trazo que el logo SVG). */
const LOGO_PATH =
  "M256 60 C256 60 120 220 120 330 C120 405 181 466 256 466 " +
  "C331 466 392 405 392 330 C392 220 256 60 256 60 Z " +
  "M190 210 H270 C330 210 360 255 360 305 C360 355 330 400 270 400 H190 Z " +
  "M218 240 H268 C305 240 325 270 325 305 C325 340 305 370 268 370 H218 Z";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  azul: "Azul",
  cardnet: "CardNET",
  visanet: "VisaNet",
  paypal: "PayPal",
  manual: "Manual",
  other: "Otro",
};

type PDFDoc = InstanceType<typeof PDFDocument>;

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function rd(n: number): string {
  return `RD$${money(n)}`;
}

function docTitle(p: Proforma, cls: SaleDocClass): string {
  if (cls === "proforma") return "PROFORMA";
  if (cls === "ecf") {
    return p.ecfType === "31"
      ? "FACTURA DE CRÉDITO FISCAL ELECTRÓNICA"
      : "FACTURA DE CONSUMO ELECTRÓNICA";
  }
  // NCF tradicional
  return p.ecfType === "31" || p.sequenceType === "credito_fiscal"
    ? "FACTURA DE CRÉDITO FISCAL"
    : "FACTURA DE CONSUMO";
}

function formatDate(value: string | Date | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Genera el PDF A4 del documento de venta. `business` aporta la identidad del
 * emisor (logo, RNC, dirección, contacto). Reutilizable desde el endpoint de
 * descarga y el de compartir por WhatsApp.
 */
export async function generateSaleDocumentPdf(
  proforma: Proforma,
  business: Business,
): Promise<Buffer> {
  const cls = classifySaleDocument(proforma);
  const demo = proforma.status !== "converted_to_ecf";

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          // Title se mantiene con el comprobante (ASCII) para que sea fácil de
          // identificar; Subject lleva el tipo legible (puede tener acentos).
          Title: proforma.ecfNumber ?? proforma.number,
          Author: business.legalName || business.commercialName || "DermaLand",
          Subject: docTitle(proforma, cls),
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) =>
        reject(new SaleDocumentPdfError("pdfkit falló", err)),
      );

      renderHeader(doc, proforma, business, cls);
      renderParties(doc, proforma);
      renderItems(doc, proforma);
      renderTotals(doc, proforma);
      if (proforma.payments && proforma.payments.length > 0) {
        renderPayments(doc, proforma);
      }
      renderFooter(doc, proforma, business, cls, demo);

      doc.end();
    } catch (err) {
      reject(
        err instanceof SaleDocumentPdfError
          ? err
          : new SaleDocumentPdfError("error inesperado generando PDF", err),
      );
    }
  });
}

// ── Helpers de layout ────────────────────────────────────────────────────────

function hr(doc: PDFDoc, gapBefore = 4, gapAfter = 8): void {
  const y = doc.y + gapBefore;
  doc
    .moveTo(LEFT, y)
    .lineTo(RIGHT, y)
    .lineWidth(1)
    .strokeColor(HAIR)
    .stroke()
    .strokeColor("black");
  doc.y = y + gapAfter;
}

function drawLogo(doc: PDFDoc, x: number, y: number, size: number): void {
  doc.save();
  doc.translate(x, y).scale(size / 512);
  doc.path(LOGO_PATH).fill(BRAND, "even-odd");
  doc.restore();
  doc.fillColor("black");
}

function renderHeader(
  doc: PDFDoc,
  p: Proforma,
  business: Business,
  cls: SaleDocClass,
): void {
  const top = doc.y;
  const logoSize = 56;
  drawLogo(doc, LEFT, top, logoSize);

  const textX = LEFT + logoSize + 12;
  const rightX = 350;
  const leftW = rightX - textX - 14;

  doc
    .fillColor("black")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(business.commercialName || "DermaLand", textX, top, { width: leftW });
  doc.font("Helvetica").fontSize(9.5);
  if (business.legalName && business.legalName !== business.commercialName) {
    doc.text(business.legalName, textX, doc.y, { width: leftW });
  }
  if (business.rnc) doc.text(`RNC: ${business.rnc}`, textX, doc.y, { width: leftW });
  if (business.address) {
    const loc = [business.address, business.city].filter(Boolean).join(", ");
    doc.text(loc, textX, doc.y, { width: leftW });
  }
  if (business.phone) doc.text(`Tel.: ${business.phone}`, textX, doc.y, { width: leftW });
  if (business.whatsapp) doc.text(`WhatsApp: ${business.whatsapp}`, textX, doc.y, { width: leftW });
  doc.text("Instagram: @dermalandrd", textX, doc.y, { width: leftW });
  const leftBottom = doc.y;

  const rightW = RIGHT - rightX;
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(BRAND)
    .text(docTitle(p, cls), rightX, top, { width: rightW, align: "right" });
  doc.fillColor("black").font("Helvetica-Bold").fontSize(10);
  const numberLabel = cls === "proforma" ? "Proforma" : cls === "ecf" ? "e-NCF" : "NCF";
  doc.text(`${numberLabel}: ${p.ecfNumber ?? p.number}`, rightX, doc.y, {
    width: rightW,
    align: "right",
  });
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`Fecha: ${formatDate(p.createdAt)}`, rightX, doc.y, {
      width: rightW,
      align: "right",
    });
  const rightBottom = doc.y;

  doc.y = Math.max(leftBottom, rightBottom, top + logoSize) + 8;
  hr(doc);
}

function renderParties(doc: PDFDoc, p: Proforma): void {
  const colW = CONTENT_W / 2 - 8;
  const top = doc.y;

  // Cliente (izquierda)
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor("black").text("Cliente", LEFT, top, { width: colW });
  doc.font("Helvetica").fontSize(9.5);
  doc.text(p.customerName || "Consumidor Final", LEFT, doc.y, { width: colW });
  if (p.customerDocument) doc.text(`Doc.: ${p.customerDocument}`, LEFT, doc.y, { width: colW });
  if (p.customerPhone) doc.text(`Tel.: ${p.customerPhone}`, LEFT, doc.y, { width: colW });
  const leftBottom = doc.y;

  // Cajero / emisión (derecha)
  const rx = LEFT + colW + 16;
  doc.font("Helvetica-Bold").fontSize(10.5).text("Atendido por", rx, top, { width: colW });
  doc.font("Helvetica").fontSize(9.5).text(p.cashierName || "—", rx, doc.y, { width: colW });
  const rightBottom = doc.y;

  doc.y = Math.max(leftBottom, rightBottom);
  hr(doc, 6, 8);
}

// Columnas de la tabla de items (A4, CONTENT_W=495).
const ITEM_COLS = [
  { label: "#", x: LEFT, w: 20, align: "left" as const },
  { label: "Descripción", x: LEFT + 22, w: 250, align: "left" as const },
  { label: "Cant.", x: LEFT + 274, w: 42, align: "right" as const },
  { label: "Precio", x: LEFT + 318, w: 84, align: "right" as const },
  { label: "Total", x: LEFT + 404, w: 91, align: "right" as const },
];

function renderItemsHeader(doc: PDFDoc): number {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("black");
  for (const c of ITEM_COLS) {
    doc.text(c.label, c.x, y, { width: c.w, align: c.align });
  }
  const lineY = y + 15;
  doc
    .moveTo(LEFT, lineY)
    .lineTo(RIGHT, lineY)
    .lineWidth(1)
    .strokeColor("#888888")
    .stroke()
    .strokeColor("black");
  return lineY + 6;
}

function renderItems(doc: PDFDoc, p: Proforma): void {
  let y = renderItemsHeader(doc);
  const descCol = ITEM_COLS[1]!;
  doc.font("Helvetica").fontSize(10);

  p.items.forEach((item, idx) => {
    const desc = item.lotNumber
      ? `${item.productName} (Lote ${item.lotNumber})`
      : item.productName;
    const descH = doc.heightOfString(desc, { width: descCol.w });
    const rowH = Math.max(descH, 14) + 8;

    if (y + rowH > BOTTOM) {
      doc.addPage();
      doc.y = 50;
      y = renderItemsHeader(doc);
      doc.font("Helvetica").fontSize(10);
    }

    doc.text(String(idx + 1), ITEM_COLS[0]!.x, y, { width: ITEM_COLS[0]!.w, align: "left" });
    doc.text(desc, descCol.x, y, { width: descCol.w, align: "left" });
    doc.text(money(item.quantity), ITEM_COLS[2]!.x, y, { width: ITEM_COLS[2]!.w, align: "right" });
    doc.text(money(item.unitPrice), ITEM_COLS[3]!.x, y, { width: ITEM_COLS[3]!.w, align: "right" });
    doc.text(money(item.total), ITEM_COLS[4]!.x, y, { width: ITEM_COLS[4]!.w, align: "right" });

    y += rowH;
    doc
      .moveTo(LEFT, y - 4)
      .lineTo(RIGHT, y - 4)
      .lineWidth(0.5)
      .strokeColor("#eeeeee")
      .stroke()
      .strokeColor("black");
  });
  doc.y = y + 4;
}

function renderTotals(doc: PDFDoc, p: Proforma): void {
  const labelX = 320;
  const labelW = 135;
  const valX = 459;
  const valW = RIGHT - valX;

  const row = (label: string, value: string) => {
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor("black");
    doc.text(label, labelX, y, { width: labelW, align: "right" });
    doc.font("Helvetica-Bold").text(value, valX, y, { width: valW, align: "right" });
    doc.y = y + 16;
  };

  doc.moveDown(0.3);
  row("Subtotal:", rd(p.subtotal));
  if (p.discount > 0) {
    const lbl = p.discountPercent ? `Descuento (${p.discountPercent}%):` : "Descuento:";
    row(lbl, `- ${rd(p.discount)}`);
  }
  row("ITBIS:", rd(p.itbis));

  const ty = doc.y + 2;
  doc.rect(labelX, ty, RIGHT - labelX, 24).fill("#eef1ea");
  doc.fillColor("black");
  doc.font("Helvetica-Bold").fontSize(13).text("TOTAL:", labelX + 6, ty + 5, {
    width: labelW - 6,
    align: "right",
  });
  doc.font("Helvetica-Bold").fontSize(13).text(rd(p.total), valX - 40, ty + 5, {
    width: valW + 40,
    align: "right",
  });
  doc.y = ty + 24 + 8;
}

function renderPayments(doc: PDFDoc, p: Proforma): void {
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor("black").text("Forma de pago", LEFT, doc.y);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(9.5);
  for (const pay of p.payments) {
    const y = doc.y;
    const base = PAYMENT_LABELS[pay.method] ?? pay.method;
    const label = pay.last4 ? `${base} ····${pay.last4}` : base;
    doc.text(label, LEFT, y, { width: 300 });
    doc.text(rd(pay.amount), 360, y, { width: RIGHT - 360, align: "right" });
    doc.y = y + 14;
  }
  if ((p.amountReceived ?? 0) > p.total) {
    const y = doc.y;
    doc.fillColor("#555555").text("Vuelto", LEFT, y, { width: 300 });
    doc.text(rd(p.changeAmount ?? 0), 360, y, { width: RIGHT - 360, align: "right" });
    doc.fillColor("black");
    doc.y = y + 14;
  }
  doc.moveDown(0.2);
}

function renderFooter(
  doc: PDFDoc,
  p: Proforma,
  business: Business,
  cls: SaleDocClass,
  demo: boolean,
): void {
  if (doc.y + 60 > BOTTOM) {
    doc.addPage();
    doc.y = 50;
  }
  hr(doc, 6, 10);

  if (cls === "proforma") {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#92400e")
      .text(
        "Esta proforma no tiene validez fiscal hasta ser facturada.",
        LEFT,
        doc.y,
        { width: CONTENT_W },
      );
  } else if (demo) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#92400e")
      .text(
        "Representación impresa DEMO — sin valor fiscal, no enviada a DGII.",
        LEFT,
        doc.y,
        { width: CONTENT_W },
      );
  }
  doc.fillColor("black");

  if (business.slogan) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor("#444444")
      .text(business.slogan, LEFT, doc.y + 4, { width: CONTENT_W, align: "center" });
  }
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#666666")
    .text("Gracias por su compra en DermaLand.", LEFT, doc.y + 4, {
      width: CONTENT_W,
      align: "center",
    });
  doc.fillColor("black");
}
