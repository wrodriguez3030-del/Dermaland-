/**
 * Tipos del validador XSD e-CF (Fase 5). Sin dependencias de runtime.
 */

/** Límite de tamaño del XML a validar (anti-abuso). 2 MB. */
export const MAX_XML_BYTES = 2_000_000;

/** Tipos e-CF con XSD soportado en el validador. */
/**
 * v349 — Tipos con XSD OFICIAL disponible en docs/dgii/xsd/ (capa de VALIDACIÓN).
 * OJO: esto NO declara soporte de EMISIÓN — la capacidad de emitir sigue siendo
 * ECF_TIPOS_BUILDER (31-34) y la matriz honesta vive en ecf-capabilities.ts.
 * Tener el XSD habilita: validar entrantes (recepción B2B/façade) y desarrollar
 * los builders 41-47 contra la fuente de verdad oficial (SOURCE.md, SHA256).
 */
export const XSD_ECF_TIPOS = ["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"] as const;
export type XsdEcfTipo = (typeof XSD_ECF_TIPOS)[number];

export type ValidateEcfXmlInput = {
  /** Contenido XML a validar (string UTF-8). */
  xml: string;
  /** Contenido del XSD (string). El loader server-only lo resuelve aparte. */
  xsd: string;
  /** Nombre lógico del esquema (para el reporte). */
  schemaName?: string;
};

export type EcfValidationError = {
  /** Línea del error (si xmllint la reporta), si no null. */
  line: number | null;
  /** Mensaje SIN el XML completo (solo el detalle de xmllint). */
  message: string;
};

export type ValidateEcfXmlResult = {
  ok: boolean;
  errors: EcfValidationError[];
  warnings: string[];
  schemaName: string;
};

/** Error controlado del validador / loader (entrada inválida, XSD ausente, etc.). */
export class EcfValidatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfValidatorError";
  }
}
