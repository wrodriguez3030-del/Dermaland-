/**
 * Comparación de códigos de barra tolerante al formato UPC-A / EAN-13.
 *
 * Un UPC-A (12 dígitos, el formato de casi todo lo que viene de EE. UU., p. ej.
 * Elta MD) es, por definición de GS1, el mismo código que un EAN-13 con un cero
 * delante. Los importadores guardan la forma de 13 dígitos (`0390205022878`),
 * pero la cámara del celular (`BarcodeDetector`, formato `upc_a`) y la mayoría
 * de las pistolas devuelven los 12 dígitos (`390205022878`). Comparar con `===`
 * hacía que el conteo físico y el POS dijeran «Producto no encontrado» para
 * 113 productos del catálogo (2026-09-05).
 *
 * Módulo PURO: sin React, sin I/O. Único punto de verdad para «¿es el mismo
 * código?» — cualquier pantalla que empareje un escaneo debe pasar por aquí.
 */

/**
 * Formas equivalentes de un código. Siempre incluye el propio código (recortado)
 * en primer lugar; añade la variante UPC-A ↔ EAN-13 cuando aplica.
 */
export function barcodeVariants(raw: string | null | undefined): string[] {
  const code = String(raw ?? "").trim();
  if (!code) return [];
  if (/^\d{12}$/.test(code)) return [code, `0${code}`];
  if (/^0\d{12}$/.test(code)) return [code, code.slice(1)];
  return [code];
}

/** `true` si el código guardado y el escaneado son el mismo código de barras. */
export function sameBarcode(
  stored: string | null | undefined,
  scanned: string | null | undefined,
): boolean {
  const a = barcodeVariants(stored);
  if (a.length === 0) return false;
  const b = new Set(barcodeVariants(scanned));
  if (b.size === 0) return false;
  return a.some((v) => b.has(v));
}

/**
 * Busca por código de barras (tolerante a UPC-A/EAN-13) y, si no hay, por SKU
 * sin distinguir mayúsculas. Mismo orden de preferencia que tenían el conteo
 * físico y el POS antes de unificarse aquí.
 */
export function findByBarcodeOrSku<T extends { sku: string; barcode?: string | null }>(
  items: readonly T[],
  rawCode: string,
): T | undefined {
  const code = String(rawCode ?? "").trim();
  if (!code) return undefined;
  return (
    items.find((p) => sameBarcode(p.barcode, code)) ??
    items.find((p) => p.sku.toLowerCase() === code.toLowerCase())
  );
}
