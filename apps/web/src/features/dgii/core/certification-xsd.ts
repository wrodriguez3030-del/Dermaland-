import path from "node:path";
import { XSD_DIR, patchOfficialDgiiXsd } from "./xsd-loader";
import { validateEcfXml } from "./validator";
import { EcfValidatorError, type ValidateEcfXmlResult } from "./validator-types";

/**
 * v317 — Validación XSD OFFLINE de los formatos de certificación
 * (ARECF/ACECF/ANECF/RFCE 32) contra los XSD OFICIALES de DGII incorporados en
 * `docs/dgii/xsd/` (fuente y SHA256 en SOURCE.md; descargados de la sección
 * "Documentación Técnica (XSD)" del portal oficial el 2026-07-04).
 *
 * Mismo modelo de seguridad que el validador e-CF (v297):
 *  - allowlist fija de formatos → nombre de archivo NUNCA viene del usuario
 *    (sin path traversal) y la ruta resuelta debe quedar dentro de XSD_DIR;
 *  - lectura LOCAL de disco (cero red en runtime; jamás URLs externas);
 *  - la validación usa xmllint-wasm vía `validateEcfXml` (sin resolución de
 *    entidades externas → XXE no aplica) y hereda su cap de tamaño.
 */

export const CERTIFICATION_FORMATS = ["ARECF", "ACECF", "ANECF", "RFCE32"] as const;
export type CertificationFormat = (typeof CERTIFICATION_FORMATS)[number];

const XSD_FILE_BY_FORMAT: Record<CertificationFormat, string> = {
  ARECF: "ARECF-v1.0.xsd",
  ACECF: "ACECF-v1.0.xsd",
  ANECF: "ANECF-v1.0.xsd",
  RFCE32: "RFCE-32-v1.0.xsd",
};

export function isKnownCertificationFormat(f: string): f is CertificationFormat {
  return (CERTIFICATION_FORMATS as readonly string[]).includes(f);
}

/** Ruta absoluta del XSD oficial del formato (pura; valida allowlist + dir). */
export function resolveCertificationXsdPath(format: string): string {
  if (!isKnownCertificationFormat(format)) {
    throw new EcfValidatorError(`Formato de certificación sin XSD permitido: ${String(format)}.`);
  }
  const file = XSD_FILE_BY_FORMAT[format];
  const full = path.resolve(XSD_DIR, file);
  if (full !== path.join(XSD_DIR, file) || !full.startsWith(XSD_DIR + path.sep)) {
    throw new EcfValidatorError("Ruta XSD inválida.");
  }
  return full;
}

/** Lee el XSD oficial del formato desde disco (lazy fs; sin red). */
export async function loadCertificationXsd(format: CertificationFormat): Promise<string> {
  const full = resolveCertificationXsdPath(format);
  const { readFile } = await import("node:fs/promises");
  let contents: string;
  try {
    contents = await readFile(full, "utf8");
  } catch {
    throw new EcfValidatorError(
      `XSD oficial de ${format} no encontrado en docs/dgii/xsd/ (no se inventa XSD).`,
    );
  }
  // El BOM del archivo oficial (ANECF lo trae) rompe xmllint → se remueve en memoria.
  return patchCertificationXsd(patchOfficialDgiiXsd(contents.replace(/^﻿/, "")));
}

/**
 * Parche EN MEMORIA de typos conocidos de los XSD oficiales de certificación
 * (mismo criterio que `patchOfficialDgiiXsd`; el archivo en disco NO se toca):
 * los patterns de fecha usan grupos no-capturantes `(?:…)` (sintaxis PCRE), que
 * NO existen en las expresiones regulares de XML Schema → libxml2 no compila el
 * esquema. Se convierten a grupos normales `(…)` — el lenguaje aceptado por el
 * pattern es EXACTAMENTE el mismo; no se altera contenido fiscal.
 */
export function patchCertificationXsd(xsd: string): string {
  return xsd.replace(/\(\?:/g, "(");
}

/**
 * Placeholder de firma para validación OFFLINE de documentos aún sin firmar.
 * Los XSD de ANECF/RFCE exigen un `xs:any` final (la <Signature> XMLDSig) con
 * `processContents="skip"` — el flujo real firma ANTES de validar; para el
 * dry-run sin certificado se inserta este elemento vacío, que el esquema
 * ignora por diseño. NO es una firma fiscal (nunca se envía así).
 */
export const SIGNATURE_PLACEHOLDER = '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"/>';

export function withSignaturePlaceholder(xml: string): string {
  const m = xml.match(/<\/(ARECF|ACECF|ANECF|RFCE)>\s*$/);
  if (!m) throw new EcfValidatorError("XML de certificación sin raíz reconocida.");
  return xml.replace(m[0], `  ${SIGNATURE_PLACEHOLDER}\n${m[0]}`);
}

/**
 * Valida un XML de certificación contra su XSD oficial. Offline y determinístico.
 * `assumeUnsigned: true` = documento recién construido (sin <Signature> todavía):
 * se valida con el placeholder que el `xs:any processContents="skip"` ignora.
 */
export async function validateCertificationXml(
  format: CertificationFormat,
  xml: string,
  opts: { assumeUnsigned?: boolean } = {},
): Promise<ValidateEcfXmlResult> {
  const xsd = await loadCertificationXsd(format);
  const doc = opts.assumeUnsigned ? withSignaturePlaceholder(xml) : xml;
  return validateEcfXml({ xml: doc, xsd, schemaName: XSD_FILE_BY_FORMAT[format] });
}
