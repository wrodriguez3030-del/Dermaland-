import { PNG } from "pngjs";
import jsQR from "jsqr";
import QRCode from "qrcode";

/**
 * v424 (hotfix Paso 6) — Decodificación REAL del QR de la Representación Impresa.
 * No basta validar la cadena previa: se decodifica el QR gráfico (PNG lossless, el mismo
 * que se embebe en el PDF con `pdf.embedPng`) y se compara con la URL esperada. Sirve para
 * el guard de readiness y las pruebas de regresión (impide que E43/E47 vuelvan a fallar).
 * Puro-server, determinista, sin red.
 */

/** Decodifica un PNG de QR (buffer) → contenido (string) o null si no decodifica. */
export function decodeQrPngBuffer(png: Buffer): string | null {
  const img = PNG.sync.read(png);
  const data = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length);
  const result = jsQR(data, img.width, img.height);
  return result?.data ?? null;
}

/**
 * Codifica una URL a QR PNG EXACTAMENTE como el renderer (mismos parámetros) y la
 * decodifica de vuelta. Devuelve {decoded, matches}. Prueba el round-trip real (detecta
 * URL demasiado larga/truncada, caracteres que rompen el QR, etc.).
 */
export async function encodeAndDecodeUrl(
  url: string,
  opts: { errorCorrectionLevel?: "L" | "M" | "Q" | "H"; margin?: number; width?: number } = {},
): Promise<{ decoded: string | null; matches: boolean; pngBytes: number }> {
  const png = await QRCode.toBuffer(url, {
    errorCorrectionLevel: opts.errorCorrectionLevel ?? "M",
    margin: opts.margin ?? 4,
    width: opts.width ?? 600,
    type: "png",
  });
  const decoded = decodeQrPngBuffer(png);
  return { decoded, matches: decoded === url, pngBytes: png.length };
}
