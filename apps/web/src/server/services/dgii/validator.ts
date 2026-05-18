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
 * Normaliza un XSD oficial DGII antes de pasarlo a xmllint:
 *
 * 1. Strip UTF-8 BOM (los XSDs e-CF 32/33/34 traen `﻿` al inicio;
 *    xmllint a veces se queja).
 * 2. Corrige el typo del XSD e-CF 31:
 *    `<xs:simpleType name=" IndicadorServicioTodoIncluidoType">` (espacio
 *    inicial) — xmllint rechaza compilar el schema porque el tipo
 *    declarado con espacio no coincide con la referencia
 *    `type="IndicadorServicioTodoIncluidoType"`. Los XSDs e-CF 32/33/34
 *    NO tienen este typo (DGII lo corrigió allí pero NO en 31).
 *
 * El archivo de `docs/dgii/xsd/` se deja intacto — solo se normaliza en
 * memoria. Si DGII publica un XSD 31 corregido, los reemplazos quedan sin
 * efecto.
 *
 * Estado del typo (matriz D-12):
 *  - e-CF 31: typo presente — parche activo.
 *  - e-CF 32: limpio.
 *  - e-CF 33: limpio.
 *  - e-CF 34: limpio.
 */
export function patchOfficialDgiiXsd(xsd: string): string {
  let out = xsd;
  // 1. Strip BOM si está presente.
  if (out.charCodeAt(0) === 0xfeff) {
    out = out.slice(1);
  }
  // 2. Typo conocido del XSD 31. No-op si no aparece (32/33/34).
  out = out.replace(
    '<xs:simpleType name=" IndicadorServicioTodoIncluidoType">',
    '<xs:simpleType name="IndicadorServicioTodoIncluidoType">',
  );
  return out;
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
