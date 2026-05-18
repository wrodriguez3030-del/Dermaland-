// NOTA: pure function — sin red, sin fs. El guard `import "server-only"`
// se aplica en `service.ts`; este archivo se deja importable desde tests.

/**
 * Cálculo del "Código de Seguridad" del e-CF.
 *
 * DGII requiere un código de seguridad (6-8 caracteres alfanuméricos)
 * impreso en la representación impresa y embebido en el QR de consulta.
 * Sirve para verificar la integridad del comprobante.
 *
 * La regla EXACTA del algoritmo está en documentación oficial DGII y
 * **debe validarse antes de certificación** (duda D-06 en
 * `matriz-requisitos-dgii.md`). La implementación abajo es una
 * interpretación común: extraer los primeros 8 caracteres del
 * `SignatureValue` del XML firmado (base64), depurando los no-alfanum.
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

export interface SecurityCodeOptions {
  /** Longitud del código resultante. Default 8 (rango común DGII 6-8). */
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
  // SignatureValue es base64 con saltos. Limpiamos a chars alfanuméricos.
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "");
  const length = options.length ?? 8;
  if (cleaned.length < length) {
    throw new DgiiSecurityCodeError(
      `SignatureValue no tiene suficientes chars alfanuméricos (necesarios: ${length}, encontrados: ${cleaned.length})`,
    );
  }
  return cleaned.slice(0, length);
}
