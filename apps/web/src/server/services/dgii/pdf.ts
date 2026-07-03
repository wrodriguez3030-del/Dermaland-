// NOTA: pure async function — produce un Buffer en memoria. Sin red, sin
// fs persistente. El guard `import "server-only"` se aplica en `service.ts`;
// este archivo se deja importable desde tests vitest.

import PDFDocument from "pdfkit";
import {
  buildDgiiConsultaUrl,
  generateQrCodePng,
  type Ambiente,
} from "./qr";
import { computeSecurityCode } from "./security-code";
import { formatDgiiAmount, formatDgiiDate, formatDgiiDateTime } from "./builder";
import type {
  EcfBuilderInput,
  EcfEmisor,
  EcfComprador,
  EcfItem,
  EcfTotales,
} from "./types";

/**
 * Generador de la representación impresa (PDF A4) del e-CF.
 *
 * Layout orientado a legibilidad y profesionalismo:
 *  - Encabezado: logo DermaLand + identidad del emisor (RNC, dirección,
 *    teléfono/email) a la izquierda; tipo de documento, e-NCF y fecha a la
 *    derecha.
 *  - Comprador: nombre, RNC/Cédula, teléfono y dirección cuando existan.
 *  - Tabla de items con #, descripción (wrap), cantidad, precio, ITBIS y
 *    total — altura por fila, sin textos cortados ni montados.
 *  - Totales con el TOTAL destacado; forma de pago con sólo los últimos 4
 *    (nunca el número completo de tarjeta).
 *  - QR aislado en su propio bloque, con márgenes; la nota DEMO va debajo de
 *    todo, sin tocar el QR.
 *
 * Es presentación pura: NO toca XML, firma, secuencias ni ambiente fiscal.
 * NO depende de fonts externas (Helvetica) ni escribe a disco.
 */

export class DgiiPdfError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(`DgiiPdf: ${message}`);
    this.name = "DgiiPdfError";
    this.cause = cause;
  }
}

const ESTADOS_DGII = [
  "draft",
  "generated",
  "validated",
  "signed",
  "submitted",
  "in_process",
  "accepted",
  "accepted_conditional",
  "rejected",
  "cancelled",
  "error",
  "voided",
] as const;
export type EstadoDgii = (typeof ESTADOS_DGII)[number];

const TIPO_LABELS: Record<string, string> = {
  "31": "Factura de Crédito Fiscal",
  "32": "Factura de Consumo",
  "33": "Nota de Débito",
  "34": "Nota de Crédito",
  "41": "Comprobante de Compras",
  "43": "Gastos Menores",
  "44": "Regímenes Especiales",
  "45": "Gubernamental",
  "46": "Exportaciones",
  "47": "Pagos al Exterior",
};

// ── Geometría de página (A4, márgenes seguros de 50pt) ───────────────────────
// A4 = 595.28 × 841.89 pt.
const LEFT = 50;
const RIGHT = 545;
const CONTENT_W = RIGHT - LEFT; // 495
const BOTTOM = 790; // 841.89 − ~50
const BRAND = "#7E8A6E";
const HAIR = "#cccccc";

/**
 * Marca DermaLand como path vectorial (mismo trazo que el logo SVG, sólo con
 * curvas Bézier para compatibilidad con el parser de pdfkit). La "D" queda
 * calada vía regla even-odd: sobre papel blanco se ve verde con la D blanca.
 */
const LOGO_PATH =
  "M256 60 C256 60 120 220 120 330 C120 405 181 466 256 466 " +
  "C331 466 392 405 392 330 C392 220 256 60 256 60 Z " +
  "M190 210 H270 C330 210 360 255 360 305 C360 355 330 400 270 400 H190 Z " +
  "M218 240 H268 C305 240 325 270 325 305 C325 340 305 370 268 370 H218 Z";

/** Línea de forma de pago para mostrar en el PDF (sólo últimos 4, nunca PAN). */
export interface PdfPaymentLine {
  label: string;
  amount: number;
  last4?: string;
}

export interface GenerateEcfPdfInput {
  /** Datos del e-CF (mismo shape que el builder). */
  ecf: EcfBuilderInput;
  /** XML firmado por `signEcfXml`. Se usa para extraer el código de seguridad. */
  signedXml: string;
  /** Ambiente DGII activo (para construir la URL del QR). */
  ambiente: Ambiente;
  /** Estado DGII actual del comprobante. */
  estadoDgii: EstadoDgii;
  /** TrackId opcional (cuando ya se envió a DGII). */
  trackId?: string;
  /** Cuando es `true`, muestra la nota de vista previa DEMO en el pie. */
  demo?: boolean;
  /** Teléfono del comprador (opcional) para el bloque de cliente. */
  compradorTelefono?: string;
  /** Formas de pago (opcional) — sólo últimos 4 dígitos, nunca el PAN. */
  paymentLines?: PdfPaymentLine[];
}

type PDFDoc = InstanceType<typeof PDFDocument>;

/**
 * Geometría del pie con QR. Fuente única de verdad para el renderer y los
 * tests: garantiza que el QR cabe en los márgenes y que la columna de texto
 * deja un espacio (`gap`) sin tocar el QR.
 */
export function footerQrLayout() {
  const qrSize = 92;
  const qrX = RIGHT - qrSize;
  const gap = 24;
  const textWidth = qrX - LEFT - gap;
  return { qrSize, qrX, gap, textWidth, pageLeft: LEFT, pageRight: RIGHT };
}

export async function generateEcfPdf(
  input: GenerateEcfPdfInput,
): Promise<Buffer> {
  let codigoSeguridad: string;
  try {
    codigoSeguridad = computeSecurityCode(input.signedXml);
  } catch (err) {
    throw new DgiiPdfError(
      "No se pudo derivar el código de seguridad del XML firmado",
      err,
    );
  }

  const url = buildDgiiConsultaUrl({
    ambiente: input.ambiente,
    rncEmisor: input.ecf.emisor.rncEmisor,
    rncComprador: input.ecf.comprador.rncComprador,
    eNcf: input.ecf.eNcf,
    fechaEmision: input.ecf.emisor.fechaEmision,
    montoTotal: input.ecf.totales.montoTotal,
    // Misma fecha de firma que lleva el XML (consistencia QR↔XML).
    fechaFirma: input.ecf.fechaHoraFirma,
    codigoSeguridad,
  });

  const qrPng = await generateQrCodePng(url, { scale: 6, margin: 1 });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title: `e-CF ${input.ecf.eNcf}`,
          Author: input.ecf.emisor.razonSocialEmisor,
          Subject:
            TIPO_LABELS[input.ecf.tipoEcf] ?? `e-CF ${input.ecf.tipoEcf}`,
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) =>
        reject(new DgiiPdfError("pdfkit falló", err)),
      );

      const t = input.ecf.totales;
      const itbisRatio =
        t.montoGravadoTotal && t.montoGravadoTotal > 0 && t.totalItbis
          ? t.totalItbis / t.montoGravadoTotal
          : 0;

      renderHeader(doc, input.ecf.emisor, input.ecf.tipoEcf, input.ecf.eNcf);
      renderComprador(
        doc,
        input.ecf.comprador,
        input.ecf.emisor.fechaEmision,
        input.compradorTelefono,
      );
      renderItems(doc, input.ecf.items, itbisRatio);
      renderTotales(doc, input.ecf.totales);
      if (input.paymentLines && input.paymentLines.length > 0) {
        renderPagos(doc, input.paymentLines);
      }
      renderFooter(doc, {
        estadoDgii: input.estadoDgii,
        trackId: input.trackId,
        codigoSeguridad,
        ambiente: input.ambiente,
        fechaHoraFirma: input.ecf.fechaHoraFirma,
        qrPng,
        demo: input.demo ?? false,
      });

      doc.end();
    } catch (err) {
      reject(
        err instanceof DgiiPdfError
          ? err
          : new DgiiPdfError("error inesperado generando PDF", err),
      );
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de layout
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderHeader(
  doc: PDFDoc,
  emisor: EcfEmisor,
  tipoEcf: string,
  eNcf: string,
): void {
  const top = doc.y;
  const logoSize = 56;
  drawLogo(doc, LEFT, top, logoSize);

  const textX = LEFT + logoSize + 12; // 118
  const rightX = 360;
  const leftW = rightX - textX - 14; // ~228

  doc
    .fillColor("black")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(emisor.razonSocialEmisor, textX, top, { width: leftW });
  doc.font("Helvetica").fontSize(10);
  if (
    emisor.nombreComercial &&
    emisor.nombreComercial !== emisor.razonSocialEmisor
  ) {
    doc.text(emisor.nombreComercial, textX, doc.y, { width: leftW });
  }
  doc.fontSize(9.5);
  doc.text(`RNC: ${emisor.rncEmisor}`, textX, doc.y, { width: leftW });
  doc.text(emisor.direccionEmisor, textX, doc.y, { width: leftW });
  if (emisor.municipio) {
    doc.text(
      `${emisor.municipio}${emisor.provincia ? ", " + emisor.provincia : ""}`,
      textX,
      doc.y,
      { width: leftW },
    );
  }
  if (emisor.telefonosEmisor && emisor.telefonosEmisor.length > 0) {
    doc.text(`Tel.: ${emisor.telefonosEmisor.join(" / ")}`, textX, doc.y, {
      width: leftW,
    });
  }
  if (emisor.correoEmisor) {
    doc.text(emisor.correoEmisor, textX, doc.y, { width: leftW });
  }
  const leftBottom = doc.y;

  const rightW = RIGHT - rightX; // 185
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(BRAND)
    .text(TIPO_LABELS[tipoEcf] ?? "Comprobante Fiscal Electrónico", rightX, top, {
      width: rightW,
      align: "right",
    });
  doc
    .fillColor("black")
    .font("Helvetica")
    .fontSize(10)
    .text(`e-CF tipo ${tipoEcf}`, rightX, doc.y, {
      width: rightW,
      align: "right",
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(`e-NCF: ${eNcf}`, rightX, doc.y, { width: rightW, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`Fecha: ${formatDgiiDate(emisor.fechaEmision)}`, rightX, doc.y, {
      width: rightW,
      align: "right",
    });
  const rightBottom = doc.y;

  doc.y = Math.max(leftBottom, rightBottom, top + logoSize) + 8;
  hr(doc);
}

function renderComprador(
  doc: PDFDoc,
  comprador: EcfComprador,
  fechaEmision: Date,
  telefono?: string,
): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("black")
    .text("Datos del comprador", LEFT, doc.y);
  doc.moveDown(0.25);
  doc.font("Helvetica").fontSize(10);
  doc.text(
    `Cliente: ${comprador.razonSocialComprador || "Consumidor Final"}`,
    LEFT,
    doc.y,
    { width: CONTENT_W },
  );
  doc.text(`RNC/Cédula: ${comprador.rncComprador ?? "No aplica"}`, LEFT, doc.y, {
    width: CONTENT_W,
  });
  if (telefono) {
    doc.text(`Teléfono: ${telefono}`, LEFT, doc.y, { width: CONTENT_W });
  }
  if (comprador.direccionComprador) {
    doc.text(`Dirección: ${comprador.direccionComprador}`, LEFT, doc.y, {
      width: CONTENT_W,
    });
  }
  doc.text(`Fecha de emisión: ${formatDgiiDate(fechaEmision)}`, LEFT, doc.y, {
    width: CONTENT_W,
  });
  hr(doc, 6, 8);
}

// Columnas de la tabla de items (x, ancho, alineación) — A4 (CONTENT_W=495).
const ITEM_COLS = [
  { label: "#", x: LEFT, w: 20, align: "left" as const },
  { label: "Descripción", x: LEFT + 22, w: 205, align: "left" as const },
  { label: "Cant.", x: LEFT + 229, w: 42, align: "right" as const },
  { label: "Precio U.", x: LEFT + 273, w: 70, align: "right" as const },
  { label: "ITBIS", x: LEFT + 345, w: 66, align: "right" as const },
  { label: "Total", x: LEFT + 413, w: 82, align: "right" as const },
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

function renderItems(doc: PDFDoc, items: EcfItem[], itbisRatio: number): void {
  let y = renderItemsHeader(doc);
  const descCol = ITEM_COLS[1]!;

  doc.font("Helvetica").fontSize(10);
  for (const item of items) {
    const desc = item.descripcionItem
      ? `${item.nombreItem} — ${item.descripcionItem}`
      : item.nombreItem;
    const descH = doc.heightOfString(desc, { width: descCol.w });
    const rowH = Math.max(descH, 14) + 8;

    if (y + rowH > BOTTOM) {
      doc.addPage();
      doc.y = 50;
      y = renderItemsHeader(doc);
      doc.font("Helvetica").fontSize(10);
    }

    const itbisLinea = item.montoItem * itbisRatio;
    doc.text(String(item.numeroLinea), ITEM_COLS[0]!.x, y, {
      width: ITEM_COLS[0]!.w,
      align: "left",
    });
    doc.text(desc, descCol.x, y, { width: descCol.w, align: "left" });
    doc.text(formatDgiiAmount(item.cantidadItem), ITEM_COLS[2]!.x, y, {
      width: ITEM_COLS[2]!.w,
      align: "right",
    });
    doc.text(formatDgiiAmount(item.precioUnitarioItem), ITEM_COLS[3]!.x, y, {
      width: ITEM_COLS[3]!.w,
      align: "right",
    });
    doc.text(formatDgiiAmount(itbisLinea), ITEM_COLS[4]!.x, y, {
      width: ITEM_COLS[4]!.w,
      align: "right",
    });
    doc.text(formatDgiiAmount(item.montoItem), ITEM_COLS[5]!.x, y, {
      width: ITEM_COLS[5]!.w,
      align: "right",
    });

    y += rowH;
    doc
      .moveTo(LEFT, y - 4)
      .lineTo(RIGHT, y - 4)
      .lineWidth(0.5)
      .strokeColor("#eeeeee")
      .stroke()
      .strokeColor("black");
  }
  doc.y = y + 4;
}

function renderTotales(doc: PDFDoc, totales: EcfTotales): void {
  const labelX = 325;
  const labelW = 130;
  const valX = 459;
  const valW = RIGHT - valX; // 86

  const row = (label: string, value: string) => {
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor("black");
    doc.text(label, labelX, y, { width: labelW, align: "right" });
    doc.font("Helvetica-Bold").text(value, valX, y, {
      width: valW,
      align: "right",
    });
    doc.y = y + 16;
  };

  doc.moveDown(0.3);
  if (totales.montoGravadoTotal !== undefined) {
    row("Subtotal gravado:", formatDgiiAmount(totales.montoGravadoTotal));
  }
  if (totales.montoExento !== undefined && totales.montoExento > 0) {
    row("Monto exento:", formatDgiiAmount(totales.montoExento));
  }
  if (totales.totalItbis !== undefined) {
    row("ITBIS:", formatDgiiAmount(totales.totalItbis));
  }

  const ty = doc.y + 2;
  doc.rect(labelX, ty, RIGHT - labelX, 24).fill("#eef1ea");
  doc.fillColor("black");
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("TOTAL:", labelX + 6, ty + 5, { width: labelW - 6, align: "right" });
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(formatDgiiAmount(totales.montoTotal), valX, ty + 5, {
      width: valW,
      align: "right",
    });
  doc.y = ty + 24 + 8;
}

function renderPagos(doc: PDFDoc, lines: PdfPaymentLine[]): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor("black")
    .text("Forma de pago", LEFT, doc.y);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(9.5);
  for (const p of lines) {
    const y = doc.y;
    const label = p.last4 ? `${p.label} ····${p.last4}` : p.label;
    doc.text(label, LEFT, y, { width: 300 });
    doc.text(formatDgiiAmount(p.amount), 360, y, {
      width: RIGHT - 360,
      align: "right",
    });
    doc.y = y + 14;
  }
  doc.moveDown(0.2);
}

function renderFooter(
  doc: PDFDoc,
  data: {
    estadoDgii: EstadoDgii;
    trackId?: string;
    codigoSeguridad: string;
    ambiente: Ambiente;
    fechaHoraFirma: Date;
    qrPng: Buffer;
    demo: boolean;
  },
): void {
  const { qrSize, qrX, textWidth: textW } = footerQrLayout();
  const qrLabelH = 14;
  const needed = 12 + qrSize + qrLabelH + 60;
  if (doc.y + needed > BOTTOM) {
    doc.addPage();
    doc.y = 50;
  }

  hr(doc, 6, 10);
  const blockY = doc.y;
  const qrY = blockY;

  doc.font("Helvetica").fontSize(9.5).fillColor("black");
  doc.text(`Estado DGII: ${data.estadoDgii}`, LEFT, blockY, { width: textW });
  doc.text(`Ambiente: ${data.ambiente}`, LEFT, doc.y, { width: textW });
  if (data.trackId) {
    doc.text(`TrackId: ${data.trackId}`, LEFT, doc.y, { width: textW });
  }
  doc.text(
    `Fecha/hora firma: ${formatDgiiDateTime(data.fechaHoraFirma)}`,
    LEFT,
    doc.y,
    { width: textW },
  );
  doc
    .font("Helvetica-Bold")
    .text(`Código de Seguridad: ${data.codigoSeguridad}`, LEFT, doc.y, {
      width: textW,
    });
  const textBottom = doc.y;

  doc.image(data.qrPng, qrX, qrY, { width: qrSize, height: qrSize });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#555555")
    .text("Escanee para consultar en DGII", qrX - 14, qrY + qrSize + 3, {
      width: qrSize + 28,
      align: "center",
    });
  doc.fillColor("black");
  const qrBottom = qrY + qrSize + qrLabelH;

  let noteY = Math.max(textBottom, qrBottom) + 14;
  if (data.demo) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#92400e")
      .text(
        "Vista previa e-CF DEMO — sin valor fiscal, no enviada a DGII.",
        LEFT,
        noteY,
        { width: CONTENT_W, align: "left" },
      );
    noteY = doc.y + 4;
  }
  doc
    .font("Helvetica-Oblique")
    .fontSize(8.5)
    .fillColor("#444444")
    .text(
      "Representación Impresa del e-CF. La validez fiscal está sujeta al estado " +
        "del comprobante en la DGII. Escanee el código QR para consultarlo.",
      LEFT,
      noteY,
      { width: CONTENT_W, align: "justify" },
    );
  doc.fillColor("black");
}
