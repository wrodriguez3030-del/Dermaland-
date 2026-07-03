// NOTA: pure function — produce strings/Buffers. Sin red, sin fs. El guard
// `import "server-only"` se aplica en `service.ts`; este archivo se deja
// importable desde tests vitest.

import QRCode from "qrcode";
import { formatDgiiDate, formatDgiiDateTime } from "./builder";

/**
 * Helpers de QR + URL de consulta DGII para la representación impresa.
 *
 * El QR impreso en cada comprobante apunta a la **página** de consulta
 * pública del timbre DGII (la escanea un humano — no un endpoint de API).
 * Dos variantes según la norma de representación impresa:
 *
 *  - **e-CF general** (31/33/34/41/43/44/45, y 32 con MontoTotal >= RD$250,000):
 *    `https://ecf.dgii.gov.do/{ambiente}/ConsultaTimbre?...` con RncEmisor,
 *    RncComprador (si aplica), ENCF, FechaEmision, MontoTotal, FechaFirma y
 *    CodigoSeguridad.
 *  - **Factura de consumo < RD$250,000** (e-CF 32): endpoint reducido
 *    `https://fc.dgii.gov.do/{ambiente}/ConsultaTimbreFC?...` con RncEmisor,
 *    ENCF, MontoTotal y CodigoSeguridad (sin comprador ni fechas).
 *
 * Los nombres exactos de host/path/parámetros deben re-confirmarse contra la
 * documentación oficial vigente antes de certificación (duda D-06 en
 * `matriz-requisitos-dgii.md`).
 */

export type Ambiente = "testecf" | "certecf" | "ecf";

/** Umbral DGII: consumo bajo este monto usa la consulta reducida FC. */
export const FC_MONTO_THRESHOLD = 250_000;

/** Segmento de ambiente en el path de consulta. */
const AMBIENTE_SEGMENT: Record<Ambiente, string> = {
  testecf: "testecf",
  certecf: "certecf",
  ecf: "ecf",
};

export interface DgiiConsultaUrlInput {
  ambiente: Ambiente;
  rncEmisor: string;
  /** Puede omitirse para e-CF 32 (consumidor final). */
  rncComprador?: string;
  eNcf: string;
  fechaEmision: Date;
  montoTotal: number;
  /** Código de seguridad calculado por `computeSecurityCode`. */
  codigoSeguridad: string;
  /**
   * Fecha/hora de la firma. Obligatoria para la consulta general (todo lo
   * que no sea consumo < RD$250,000). Acepta el string `FechaHoraFirma` del
   * XML tal cual (`dd-MM-yyyy HH:mm:ss`) para garantizar consistencia
   * QR↔XML, o un `Date` que se formatea igual que el builder.
   */
  fechaFirma?: Date | string;
}

export class DgiiConsultaUrlError extends Error {
  constructor(message: string) {
    super(`DgiiConsultaUrl: ${message}`);
    this.name = "DgiiConsultaUrlError";
  }
}

/** Tipo e-CF derivado del eNCF ('E' + 2 dígitos de tipo + secuencia). */
function ecfTypeFromEncf(eNcf: string): string {
  return eNcf.slice(1, 3);
}

/** ¿Aplica la consulta reducida de factura de consumo (FC)? */
export function isFcConsultaTimbre(eNcf: string, montoTotal: number): boolean {
  return ecfTypeFromEncf(eNcf) === "32" && montoTotal < FC_MONTO_THRESHOLD;
}

/**
 * Construye la URL de consulta DGII que va embebida en el QR.
 */
export function buildDgiiConsultaUrl(input: DgiiConsultaUrlInput): string {
  const seg = AMBIENTE_SEGMENT[input.ambiente];

  if (isFcConsultaTimbre(input.eNcf, input.montoTotal)) {
    // Consumo < 250k: consulta reducida en fc.dgii.gov.do, sin comprador
    // ni fechas.
    const url = new URL(`https://fc.dgii.gov.do/${seg}/ConsultaTimbreFC`);
    url.searchParams.set("RncEmisor", input.rncEmisor);
    url.searchParams.set("ENCF", input.eNcf);
    url.searchParams.set("MontoTotal", input.montoTotal.toFixed(2));
    url.searchParams.set("CodigoSeguridad", input.codigoSeguridad);
    return url.toString();
  }

  if (!input.fechaFirma) {
    throw new DgiiConsultaUrlError(
      "fechaFirma es obligatoria para la consulta general del timbre " +
        "(solo la factura de consumo < RD$250,000 la omite)",
    );
  }
  const fechaFirma =
    typeof input.fechaFirma === "string"
      ? input.fechaFirma
      : formatDgiiDateTime(input.fechaFirma);

  const url = new URL(`https://ecf.dgii.gov.do/${seg}/ConsultaTimbre`);
  url.searchParams.set("RncEmisor", input.rncEmisor);
  if (input.rncComprador) {
    url.searchParams.set("RncComprador", input.rncComprador);
  }
  url.searchParams.set("ENCF", input.eNcf);
  url.searchParams.set("FechaEmision", formatDgiiDate(input.fechaEmision));
  url.searchParams.set("MontoTotal", input.montoTotal.toFixed(2));
  url.searchParams.set("FechaFirma", fechaFirma);
  url.searchParams.set("CodigoSeguridad", input.codigoSeguridad);
  return url.toString();
}

export interface QrOptions {
  /** Margen en módulos. Default 1 (denso, mejor para impresión). */
  margin?: number;
  /** Tamaño de cada módulo en px. Default 4. */
  scale?: number;
  /** Nivel de corrección de errores. Default 'M' (medio). */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

/** Genera un QR PNG (Buffer) listo para embebr en PDF o servir como image. */
export async function generateQrCodePng(
  url: string,
  options: QrOptions = {},
): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    margin: options.margin ?? 1,
    scale: options.scale ?? 4,
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M",
  });
}

/** Genera un QR SVG (string) — útil para HTML/print sin embebr binarios. */
export async function generateQrCodeSvg(
  url: string,
  options: QrOptions = {},
): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: options.margin ?? 1,
    width: (options.scale ?? 4) * 33, // ~33 módulos × scale → tamaño SVG
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M",
  });
}

/**
 * Genera un QR como data URL base64 — útil cuando el caller necesita una
 * sola string para embebr en `<img src>` sin tocar el filesystem.
 */
export async function generateQrCodeDataUrl(
  url: string,
  options: QrOptions = {},
): Promise<string> {
  return QRCode.toDataURL(url, {
    type: "image/png",
    margin: options.margin ?? 1,
    scale: options.scale ?? 4,
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M",
  });
}
