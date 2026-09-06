/**
 * v316 — Validadores compartidos de los formatos DGII de certificación
 * (ARECF/ACECF/ANECF/RFCE). PUROS: sin DB, sin red, sin secuencias.
 *
 * Fuente: PDFs oficiales "Formato Acuse de Recibo v1.0", "Formato Aprobación
 * Comercial v1.0", "Formato Anulación de e-NCF v1.0" y "Formato Resumen Factura
 * Consumo Electrónica v1.0" (dgii.gov.do → Documentación sobre e-CF → Formatos
 * XML), extraídos campo a campo el 2026-07-03. La validación XSD oficial de
 * estos 4 formatos queda PENDIENTE de descargar (docs/dgii/xsd/README).
 */

export class DgiiBuilderError extends Error {
  constructor(
    message: string,
    public readonly field: string,
  ) {
    super(message);
    this.name = "DgiiBuilderError";
  }
}

export function assertField(cond: boolean, field: string, message: string): asserts cond {
  if (!cond) throw new DgiiBuilderError(message, field);
}

/** RNC/Cédula: NUM de 9 u 11 dígitos (validación de estructura, no de padrón). */
export function isValidRnc(v: string): boolean {
  return /^\d{9}$/.test(v) || /^\d{11}$/.test(v);
}

/** e-NCF: 13 posiciones — serie E-Z (excepto P) + tipo 2 dígitos + secuencial 10 dígitos. */
export function isValidEncf(v: string): boolean {
  return /^[E-OQ-Z]\d{12}$/.test(v);
}

/** Tipo de e-CF del catálogo oficial (Formato Anulación, campo TipoeCF). */
export const TIPOS_ECF = ["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"] as const;
export type TipoEcfCodigo = (typeof TIPOS_ECF)[number];

/** Fecha dd-MM-AAAA (10). */
export function isValidDgiiDate(v: string): boolean {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(v)) return false;
  const [dd, mm] = v.split("-").map(Number);
  return dd! >= 1 && dd! <= 31 && mm! >= 1 && mm! <= 12;
}

/** Fecha y hora dd-MM-AAAA HH:mm:ss (19). */
export function isValidDgiiDateTime(v: string): boolean {
  if (!/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/.test(v)) return false;
  const [d, t] = v.split(" ");
  const [hh, mi, ss] = t!.split(":").map(Number);
  return isValidDgiiDate(d!) && hh! <= 23 && mi! <= 59 && ss! <= 59;
}

/** NUM 18 (16 enteros, 2 decimales), ≥ 0. El redondeo a 2 decimales lo hace money2str. */
export function isValidMoney(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n < 1e16;
}

/** Formatea Date → dd-MM-AAAA HH:mm:ss (formato oficial de los 4 documentos). */
export function toDgiiDateTime(d: Date): string {
  const p = (x: number, l = 2) => String(x).padStart(l, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
