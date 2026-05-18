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
 * Generador de la representación impresa (PDF) del e-CF.
 *
 * Renderiza el comprobante con la información requerida por DGII:
 *  - Encabezado del emisor (RNC, razón social, nombre comercial, dirección).
 *  - Tipo de comprobante, e-NCF, fecha de emisión.
 *  - Datos del comprador cuando aplique (e-CF 32 puede ser consumidor final).
 *  - Tabla de items con cantidad, precio unitario y total.
 *  - Totales (gravado, exento, ITBIS, total).
 *  - Estado DGII (default: "Aceptado" mostrado como placeholder; el caller
 *    pasa el estado real cuando lo tiene).
 *  - Código de seguridad (calculado desde el SignatureValue del XML firmado).
 *  - QR de consulta DGII apuntando a la URL pública.
 *
 * NO depende de fonts externas — usa Helvetica built-in de pdfkit.
 * NO escribe a disco — devuelve un Buffer en memoria.
 *
 * El layout es minimalista y conservador; el diseño visual final (logo,
 * paletas, etc.) llega cuando se implemente la UI de impresión real (fase
 * siguiente). Para Fase I lo importante es la estructura DGII-compliant.
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
    codigoSeguridad,
  });

  const qrPng = await generateQrCodePng(url, { scale: 5 });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
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

      renderHeader(doc, input.ecf.emisor, input.ecf.tipoEcf, input.ecf.eNcf);
      renderComprador(doc, input.ecf.comprador);
      renderItems(doc, input.ecf.items);
      renderTotales(doc, input.ecf.totales);
      renderFooter(doc, {
        estadoDgii: input.estadoDgii,
        trackId: input.trackId,
        codigoSeguridad,
        ambiente: input.ambiente,
        fechaHoraFirma: input.ecf.fechaHoraFirma,
        qrPng,
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
// Renderers
// ─────────────────────────────────────────────────────────────────────────────

type PDFDoc = InstanceType<typeof PDFDocument>;

function renderHeader(
  doc: PDFDoc,
  emisor: EcfEmisor,
  tipoEcf: string,
  eNcf: string,
): void {
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text(emisor.razonSocialEmisor, { align: "left" });
  if (emisor.nombreComercial) {
    doc.font("Helvetica").fontSize(10).text(emisor.nombreComercial);
  }
  doc.fontSize(9).font("Helvetica").text(`RNC: ${emisor.rncEmisor}`);
  doc.text(emisor.direccionEmisor);
  if (emisor.municipio) {
    doc.text(`${emisor.municipio}${emisor.provincia ? ", " + emisor.provincia : ""}`);
  }
  if (emisor.correoEmisor) {
    doc.text(emisor.correoEmisor);
  }

  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(
      `${TIPO_LABELS[tipoEcf] ?? "Comprobante Fiscal Electrónico"} (e-CF ${tipoEcf})`,
    );
  doc.fontSize(10).text(`e-NCF: ${eNcf}`);
  doc.text(`Fecha de Emisión: ${formatDgiiDate(emisor.fechaEmision)}`);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.5);
}

function renderComprador(doc: PDFDoc, comprador: EcfComprador): void {
  doc.font("Helvetica-Bold").fontSize(10).text("Comprador");
  doc.font("Helvetica").fontSize(9);
  if (comprador.razonSocialComprador) {
    doc.text(comprador.razonSocialComprador);
  } else {
    doc.text("Consumidor Final");
  }
  if (comprador.rncComprador) {
    doc.text(`RNC/Cédula: ${comprador.rncComprador}`);
  }
  if (comprador.direccionComprador) doc.text(comprador.direccionComprador);
  if (comprador.correoComprador) doc.text(comprador.correoComprador);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.5);
}

function renderItems(doc: PDFDoc, items: EcfItem[]): void {
  doc.font("Helvetica-Bold").fontSize(9);
  const headers = ["#", "Descripción", "Cant.", "Precio U.", "Total"];
  const xs = [50, 80, 360, 420, 490];
  headers.forEach((h, i) =>
    doc.text(h, xs[i], doc.y, { continued: i < headers.length - 1 }),
  );
  doc.moveDown(0.2);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.3);

  doc.font("Helvetica").fontSize(9);
  for (const item of items) {
    const y = doc.y;
    doc.text(String(item.numeroLinea), xs[0], y);
    doc.text(item.nombreItem, xs[1], y, { width: 270 });
    doc.text(formatDgiiAmount(item.cantidadItem), xs[2], y);
    doc.text(formatDgiiAmount(item.precioUnitarioItem), xs[3], y);
    doc.text(formatDgiiAmount(item.montoItem), xs[4], y);
    doc.moveDown(0.7);
  }
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.5);
}

function renderTotales(doc: PDFDoc, totales: EcfTotales): void {
  const right = (label: string, value: string) => {
    doc.font("Helvetica").fontSize(10).text(label, 380, doc.y, {
      continued: true,
      width: 110,
      align: "right",
    });
    doc.font("Helvetica-Bold").text(value, { width: 70, align: "right" });
  };

  if (totales.montoGravadoTotal !== undefined) {
    right("Monto Gravado:", formatDgiiAmount(totales.montoGravadoTotal));
  }
  if (totales.montoExento !== undefined && totales.montoExento > 0) {
    right("Monto Exento:", formatDgiiAmount(totales.montoExento));
  }
  if (totales.totalItbis !== undefined) {
    right("ITBIS:", formatDgiiAmount(totales.totalItbis));
  }
  right("Total:", formatDgiiAmount(totales.montoTotal));
  doc.moveDown(0.5);
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
  },
): void {
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.5);
  const startY = doc.y;

  // Columna izquierda: estado, ambiente, código seguridad, fecha firma.
  doc.font("Helvetica").fontSize(8).text("Estado DGII:", 50, startY, {
    continued: true,
  });
  doc.font("Helvetica-Bold").text(` ${data.estadoDgii}`);
  doc.font("Helvetica").text(`Ambiente: ${data.ambiente}`);
  if (data.trackId) doc.text(`TrackId: ${data.trackId}`);
  doc.text(`Fecha/hora firma: ${formatDgiiDateTime(data.fechaHoraFirma)}`);
  doc
    .font("Helvetica-Bold")
    .text(`Código de Seguridad: ${data.codigoSeguridad}`);

  // Columna derecha: QR
  doc.image(data.qrPng, 460, startY, { width: 100, height: 100 });

  doc.moveDown(0.5);
  doc
    .font("Helvetica-Oblique")
    .fontSize(7)
    .text(
      "Este documento es una Representación Impresa del e-CF. Validez fiscal sujeta al estado en DGII. " +
        "Escanee el QR para consultar el comprobante.",
      50,
      undefined,
      { width: 510, align: "justify" },
    );
}
