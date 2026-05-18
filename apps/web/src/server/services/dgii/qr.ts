// NOTA: pure function — produce strings/Buffers. Sin red, sin fs. El guard
// `import "server-only"` se aplica en `service.ts`; este archivo se deja
// importable desde tests vitest.

import QRCode from "qrcode";
import { formatDgiiDate } from "./builder";

/**
 * Helpers de QR + URL de consulta DGII para la representación impresa.
 *
 * El QR impreso en cada comprobante apunta a la URL de consulta pública DGII
 * (`consultaTimbre`). El consumidor escanea el QR y verifica el e-CF contra
 * la DGII.
 *
 * IMPORTANTE: el formato exacto del query string y los nombres de parámetros
 * **deben validarse contra documentación oficial DGII** antes de
 * certificación (duda D-06 en `matriz-requisitos-dgii.md`). El default que
 * usamos abajo es el patrón comúnmente publicado en guías DGII pero NO
 * confirmado oficialmente en el documento adjunto.
 */

/** Hostnames por ambiente. */
const HOSTS: Record<Ambiente, string> = {
  testecf: "ecf.dgii.gov.do",
  certecf: "ecf.dgii.gov.do",
  ecf: "ecf.dgii.gov.do",
};

/** Path por ambiente (configurable). */
const PATHS: Record<Ambiente, string> = {
  testecf: "/testecf/ConsultaTimbre/api/Consulta",
  certecf: "/certecf/ConsultaTimbre/api/Consulta",
  ecf: "/ConsultaTimbre/api/Consulta",
};

export type Ambiente = "testecf" | "certecf" | "ecf";

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
}

/**
 * Construye la URL de consulta DGII que va embebida en el QR.
 *
 * Nombre exacto del path y de los parámetros sujetos a confirmación oficial
 * (duda D-06).
 */
export function buildDgiiConsultaUrl(input: DgiiConsultaUrlInput): string {
  const url = new URL(`https://${HOSTS[input.ambiente]}${PATHS[input.ambiente]}`);
  url.searchParams.set("RncEmisor", input.rncEmisor);
  if (input.rncComprador) {
    url.searchParams.set("RncComprador", input.rncComprador);
  }
  url.searchParams.set("ENCF", input.eNcf);
  url.searchParams.set("FechaEmision", formatDgiiDate(input.fechaEmision));
  url.searchParams.set("MontoTotal", input.montoTotal.toFixed(2));
  url.searchParams.set("CodigoSeguridadIeCF", input.codigoSeguridad);
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
