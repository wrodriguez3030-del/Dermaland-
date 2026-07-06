/**
 * Normalización CANÓNICA de identidad de clientes — documento, teléfono y
 * email. Único lugar donde viven estas reglas: las usan el emparejamiento
 * venta↔cliente (`customer-purchases`), la detección de duplicados
 * (`utils/duplicate-detection`), la búsqueda y los scripts de
 * auditoría/backfill (`scripts/audit-customer-sales-relations.mjs`).
 *
 * Reglas:
 *  - Documento: solo alfanuméricos en MAYÚSCULA. Cédulas/RNC quedan como
 *    dígitos (031-0327428-2 → 03103274282); pasaportes conservan letras
 *    (ab-123456 → AB123456) para no confundir dos pasaportes distintos.
 *  - Teléfono: solo dígitos; si son 11 y arranca con "1" se quita el prefijo
 *    país (+1 829 714 1975 → 8297141975).
 *  - Email: trim + lowercase (WRODRIGUEZ3030@GMAIL.COM → wrodriguez3030@gmail.com).
 */

export function normalizeDocument(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
