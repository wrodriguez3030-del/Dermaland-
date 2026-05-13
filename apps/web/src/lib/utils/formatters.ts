/**
 * Formatters de campos comunes en RD.
 *
 * Reglas:
 * - Cada función acepta cualquier string (con guiones, espacios, paréntesis,
 *   prefijos) y devuelve la versión formateada estándar.
 * - Idempotentes: aplicar dos veces el mismo formatter NO duplica guiones.
 * - Pegado limpio: se normaliza valor pegado por el usuario.
 *
 * Validación oficial (algoritmo de cédula DGII, lookup RNC) queda fuera del
 * alcance MVP — solo formateo. Documentado en `riesgos.md` → R-FORM-01.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

/** "031-0234567-8" — total 11 dígitos: 3 + 7 + 1 */
export function formatCedula(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 3) return d;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10, 11)}`;
}

/** "101-12345-6" — total 9 dígitos: 3 + 5 + 1 */
export function formatRnc(value: string): string {
  const d = onlyDigits(value).slice(0, 9);
  if (d.length === 0) return "";
  if (d.length <= 3) return d;
  if (d.length <= 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 8)}-${d.slice(8, 9)}`;
}

/**
 * "809-555-0000" o "+1 809-555-0000".
 * Acepta entradas con +1, espacios, paréntesis, guiones.
 * - 10 dígitos locales → "AAA-BBB-CCCC".
 * - 11 dígitos empezando en 1 (e.g. del +1) → "+1 AAA-BBB-CCCC".
 * - 12+ ignora los excedentes.
 */
export function formatDominicanPhone(value: string): string {
  const trimmed = value.trim();
  const hasPlusOne =
    trimmed.startsWith("+1") || trimmed.startsWith("1 ") || trimmed.startsWith("1-");
  const digits = onlyDigits(trimmed);

  // Detectar +1 prefix: si arranca con "1" y total 11 dígitos, asumimos +1.
  const useCountryCode = hasPlusOne || (digits.length === 11 && digits.startsWith("1"));
  const local = useCountryCode ? digits.slice(1, 11) : digits.slice(0, 10);

  if (local.length === 0) return useCountryCode ? "+1 " : "";
  let formatted: string;
  if (local.length <= 3) formatted = local;
  else if (local.length <= 6) formatted = `${local.slice(0, 3)}-${local.slice(3)}`;
  else
    formatted = `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6, 10)}`;

  return useCountryCode ? `+1 ${formatted}` : formatted;
}

/**
 * Pasaporte: solo letras y números, mayúsculas, máximo 20 chars.
 * Sin formato de guiones.
 */
export function formatPassport(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 20);
}

export type DocumentType = "cedula" | "rnc" | "passport";

/**
 * Despacha al formatter correcto según el tipo de documento.
 * Útil cuando el usuario cambia el tipo y queremos reformatear el valor actual.
 */
export function normalizeDocumentByType(
  value: string,
  documentType: DocumentType,
): string {
  switch (documentType) {
    case "cedula":
      return formatCedula(value);
    case "rnc":
      return formatRnc(value);
    case "passport":
      return formatPassport(value);
  }
}

/** Cuenta dígitos efectivos (ignora separadores) — útil para validación suave. */
export function digitCount(value: string): number {
  return onlyDigits(value).length;
}

/** Validaciones suaves — devuelven mensaje en español o null si está OK. */
export function softValidateCedula(value: string): string | null {
  const d = digitCount(value);
  if (d === 0) return null;
  if (d < 11) return "Cédula incompleta — esperada 000-0000000-0 (11 dígitos).";
  return null;
}

export function softValidateRnc(value: string): string | null {
  const d = digitCount(value);
  if (d === 0) return null;
  if (d < 9) return "RNC incompleto — esperado 000-00000-0 (9 dígitos).";
  return null;
}

export function softValidatePassport(value: string): string | null {
  if (value.length === 0) return null;
  if (value.length < 5) return "Pasaporte parece muy corto.";
  return null;
}

export function softValidatePhone(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const hasPlusOne = trimmed.startsWith("+1") || trimmed.startsWith("1 ");
  const digits = onlyDigits(trimmed);
  const local = hasPlusOne || (digits.length === 11 && digits.startsWith("1"))
    ? digits.slice(1)
    : digits;
  if (local.length < 10) return "Teléfono incompleto — esperados 10 dígitos.";
  return null;
}

export function softValidateDocument(
  value: string,
  documentType: DocumentType,
): string | null {
  switch (documentType) {
    case "cedula":
      return softValidateCedula(value);
    case "rnc":
      return softValidateRnc(value);
    case "passport":
      return softValidatePassport(value);
  }
}
