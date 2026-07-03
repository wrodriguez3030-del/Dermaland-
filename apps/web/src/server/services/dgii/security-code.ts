// NOTA: pure function — sin red, sin fs. El guard `import "server-only"`
// se aplica en `service.ts`; este archivo se deja importable desde tests.

/**
 * Cálculo del "Código de Seguridad" del e-CF.
 *
 * Regla DGII (formato de representación impresa e-CF): el código de
 * seguridad son los **primeros 6 caracteres del `SignatureValue`** del XML
 * firmado, tal cual (base64: puede incluir `+`, `/`, `=`, mayúsculas y
 * minúsculas). Solo se remueve el whitespace de formato (saltos de línea /
 * indentación del XML), que no forma parte del valor base64.
 *
 * NO se eliminan caracteres no alfanuméricos: hacerlo cambiaría qué
 * caracteres quedan y el código impreso/QR no coincidiría con el que DGII
 * recomputa al validar el comprobante.
 *
 * Esta función NO consume datos sensibles más allá de lo que ya está en el
 * XML firmado público.
 */

export class DgiiSecurityCodeError extends Error {
  constructor(message: string) {
    super(`DgiiSecurityCode: ${message}`);
    this.name = "DgiiSecurityCodeError";
  }
}

/** Longitud oficial del código de seguridad DGII. */
export const SECURITY_CODE_LENGTH = 6;

export interface SecurityCodeOptions {
  /** Longitud del código resultante. Default 6 (regla DGII). */
  length?: number;
}

/**
 * Extrae el código de seguridad a partir del SignatureValue del XML firmado.
 *
 * @param signedXml XML que contiene `<SignatureValue>...</SignatureValue>`.
 * @throws DgiiSecurityCodeError si el XML no contiene SignatureValue.
 */
export function computeSecurityCode(
  signedXml: string,
  options: SecurityCodeOptions = {},
): string {
  const match = signedXml.match(
    /<(?:[\w-]+:)?SignatureValue\b[^>]*>([\s\S]+?)<\/(?:[\w-]+:)?SignatureValue>/,
  );
  if (!match) {
    throw new DgiiSecurityCodeError(
      "XML no contiene <SignatureValue>. ¿Olvidaste firmar antes?",
    );
  }
  const raw = match[1] ?? "";
  // Remover SOLO whitespace de formato XML; el valor base64 se conserva
  // íntegro (incluyendo +, /, =).
  const value = raw.replace(/\s+/g, "");
  const length = options.length ?? SECURITY_CODE_LENGTH;
  if (value.length < length) {
    throw new DgiiSecurityCodeError(
      `SignatureValue demasiado corto (necesarios: ${length}, encontrados: ${value.length})`,
    );
  }
  return value.slice(0, length);
}
