/**
 * Validador XSD e-CF (Fase 5) — local, sin efectos de red.
 *
 * Usa `xmllint-wasm` (WASM, compatible con Vercel; NO libxmljs2, NO binarios
 * nativos, NO servicios externos). No hace fetch, no toca DB, no lee certificados,
 * no firma, no envía a DGII, no usa env vars, no loggea el XML completo.
 */
import { validateXML } from "xmllint-wasm";
import {
  EcfValidatorError,
  MAX_XML_BYTES,
  type ValidateEcfXmlInput,
  type ValidateEcfXmlResult,
  type EcfValidationError,
} from "./validator-types";

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Valida un XML contra un XSD (ambos como string). Local y puro respecto a red.
 * Lanza EcfValidatorError ante entradas inválidas (vacío / demasiado grande).
 */
export async function validateEcfXml(
  input: ValidateEcfXmlInput,
): Promise<ValidateEcfXmlResult> {
  const schemaName = input.schemaName ?? "ecf";

  if (typeof input.xml !== "string" || input.xml.trim() === "") {
    throw new EcfValidatorError("XML vacío.");
  }
  if (typeof input.xsd !== "string" || input.xsd.trim() === "") {
    throw new EcfValidatorError("XSD vacío.");
  }
  if (byteLength(input.xml) > MAX_XML_BYTES) {
    throw new EcfValidatorError(
      `El XML excede el tamaño máximo permitido (${MAX_XML_BYTES} bytes).`,
    );
  }

  const res = await validateXML({
    xml: [{ fileName: "ecf.xml", contents: input.xml }],
    schema: [input.xsd],
  });

  // Mapear errores SIN incluir el XML completo (solo el mensaje de xmllint + línea).
  const errors: EcfValidationError[] = res.errors.map((e) => ({
    line: e.loc?.lineNumber ?? null,
    message: e.message,
  }));

  return {
    ok: res.valid,
    errors,
    warnings: [],
    schemaName,
  };
}
