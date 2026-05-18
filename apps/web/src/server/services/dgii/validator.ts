// NOTA: pure async function — usa xmllint-wasm (libxml2 compilado a WASM,
// sin native deps). El guard `import "server-only"` se aplica en
// `service.ts`; este archivo se deja importable desde tests vitest.

import { validateXML } from "xmllint-wasm";

/**
 * Validador XSD para e-CF DGII (RD).
 *
 * Carga el XSD oficial (`docs/dgii/xsd/e-CF-31-v1.0.xsd`) y valida que el
 * XML cumpla la estructura, orden de elementos, tipos y restricciones.
 *
 * Usa `xmllint-wasm` (libxml2 compilado a WebAssembly) — la misma librería
 * de referencia usada por la mayoría de validadores XSD en producción,
 * pero sin native deps que podrían romper el build de Vercel.
 *
 * Reglas del XSD relevantes:
 *  - El elemento final `<xs:any minOccurs="1" maxOccurs="1"/>` exige
 *    exactamente un elemento extra después de `<FechaHoraFirma>`. En
 *    e-CF DGII ese slot lo ocupa la `<Signature>` (firma XMLDSig). Por
 *    lo tanto, **un XML sin firmar FALLA** validación contra el XSD.
 *    El flujo correcto es: `buildEcfXml` → `signEcfXml` → `validateEcfXml`.
 *
 * Salida estable: `{ valid, errors[{ message, line }] }`. Los detalles
 * crudos de xmllint van en `rawErrors` por si se necesita diagnóstico
 * avanzado.
 */

export class DgiiValidatorError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(`DgiiValidator: ${message}`);
    this.name = "DgiiValidatorError";
    this.cause = cause;
  }
}

export interface ValidateEcfXmlInput {
  /** XML e-CF a validar (típicamente firmado). */
  xml: string;
  /** Contenido del XSD oficial como string UTF-8. */
  xsd: string;
}

export interface ValidationError {
  message: string;
  line: number | null;
}

export interface ValidateEcfXmlResult {
  valid: boolean;
  errors: ValidationError[];
  rawErrors: ReadonlyArray<unknown>;
}

/**
 * El XSD oficial publicado por DGII (`e-CF-31-v1.0.xsd`) tiene un typo:
 * `<xs:simpleType name=" IndicadorServicioTodoIncluidoType">` (espacio
 * inicial). xmllint rechaza el schema porque el tipo declarado con espacio
 * no coincide con la referencia `type="IndicadorServicioTodoIncluidoType"`.
 *
 * Normalizamos en memoria — el archivo de docs/dgii/xsd/ se deja intacto
 * para preservar la versión original. Si DGII publica un XSD corregido,
 * este parche queda sin efecto.
 *
 * Pendiente reportar a DGII y rastrear actualización del XSD oficial
 * (matriz D-12).
 */
export function patchOfficialDgiiXsd(xsd: string): string {
  return xsd.replace(
    '<xs:simpleType name=" IndicadorServicioTodoIncluidoType">',
    '<xs:simpleType name="IndicadorServicioTodoIncluidoType">',
  );
}

/**
 * Valida un XML e-CF contra el XSD provisto.
 *
 * El caller es responsable de leer el XSD (típicamente desde
 * `docs/dgii/xsd/e-CF-31-v1.0.xsd` o desde una copia bundleada en el
 * deploy). Aceptamos el XSD como string explícito para mantener el
 * validador puro y testeable.
 *
 * Internamente aplica `patchOfficialDgiiXsd` para corregir el typo
 * conocido en el XSD oficial DGII.
 *
 * @throws DgiiValidatorError si la entrada está mal formada (no si el
 *  XML es inválido — eso devuelve `valid: false`).
 */
export async function validateEcfXml(
  input: ValidateEcfXmlInput,
): Promise<ValidateEcfXmlResult> {
  if (!input.xml || typeof input.xml !== "string") {
    throw new DgiiValidatorError("xml requerido (string)");
  }
  if (!input.xsd || typeof input.xsd !== "string") {
    throw new DgiiValidatorError("xsd requerido (string)");
  }
  if (!input.xsd.includes("xs:schema") && !input.xsd.includes("xsd:schema")) {
    throw new DgiiValidatorError("xsd inválido: no contiene xs:schema");
  }

  const patchedXsd = patchOfficialDgiiXsd(input.xsd);

  let result;
  try {
    result = await validateXML({
      xml: { fileName: "ecf.xml", contents: input.xml },
      schema: { fileName: "ecf.xsd", contents: patchedXsd },
    });
  } catch (err) {
    throw new DgiiValidatorError("xmllint-wasm falló", err);
  }

  const errors: ValidationError[] = result.errors.map((e) => ({
    message: e.message,
    line: e.loc?.lineNumber ?? null,
  }));

  return {
    valid: result.valid,
    errors,
    rawErrors: result.errors,
  };
}
