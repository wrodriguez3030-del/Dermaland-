/**
 * Utilidades XML puras y deterministas para el builder e-CF (Fase 4).
 * Sin dependencias externas, sin efectos secundarios, sin fetch/DB/FS.
 *
 * - escapeXml escapa &, <, >, ", '.
 * - leaf() omite valores null/undefined/'' → no se emiten tags vacíos ni "undefined".
 * - group() filtra hijos nulos.
 * - serialize() produce indentación determinista, UTF-8, SIN BOM, sin firma.
 */

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * v376 — `preserveWhiteSpace=false` para el firmado XMLDSig (perfil oficial DGII
 * "Firmado de e-CF"): elimina el whitespace INSIGNIFICANTE entre elementos antes
 * de calcular el digest. DGII valida los XML firmados con `preserveWhiteSpace=false`
 * (equivalente a C14N(false,false)); si el firmante preserva el pretty-print del
 * documento (p. ej. la postulación que genera el Portal viene indentada), el
 * DigestValue declarado NO coincide con el que DGII recalcula → "Firma Inválida".
 *
 * Incidente real 2026-07-16 (postulación): demostrado que el DigestValue difiere
 * con/sin whitespace y que la firma del XML indentado deja de verificar al
 * normalizar. Los e-CF/semilla que AgendApps genera compactos no se ven afectados
 * (esta normalización es idempotente sobre un XML ya compacto).
 *
 * Seguro para el dominio DGII (XML SIN contenido mixto texto+elementos): solo
 * colapsa el whitespace que está ÍNTEGRAMENTE entre un `>` y el siguiente `<`
 * (nunca toca el texto de un elemento, que en XML válido no contiene `<`/`>`
 * sin escapar). NO re-serializa vía DOM (opera sobre el string, preservando el
 * resto byte a byte).
 */
export function stripInsignificantXmlWhitespace(xml: string): string {
  return xml.replace(/>\s+</g, "><");
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type XmlElement = {
  tag: string;
  text?: string;
  children?: XmlElement[];
};

/**
 * Crea un elemento hoja. Devuelve null si el valor es null/undefined o, para
 * strings, vacío tras trim → el llamador lo omite del XML.
 */
export function leaf(
  tag: string,
  value: string | number | null | undefined,
): XmlElement | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && text.trim() === "") return null;
  return { tag, text };
}

/** Crea un grupo con hijos; filtra los hijos nulos (campos opcionales ausentes). */
export function group(
  tag: string,
  children: Array<XmlElement | null>,
): XmlElement {
  return { tag, children: children.filter((c): c is XmlElement => c !== null) };
}

/** Serializa un árbol a XML con indentación determinista (2 espacios). */
export function serializeElement(el: XmlElement, depth = 0): string {
  const pad = "  ".repeat(depth);
  const hasChildren = el.children && el.children.length > 0;
  if (hasChildren) {
    const inner = el.children!
      .map((c) => serializeElement(c, depth + 1))
      .join("\n");
    return `${pad}<${el.tag}>\n${inner}\n${pad}</${el.tag}>`;
  }
  if (el.text !== undefined) {
    return `${pad}<${el.tag}>${escapeXml(el.text)}</${el.tag}>`;
  }
  // Elemento sin texto ni hijos → self-closing (no debería ocurrir con leaf()).
  return `${pad}<${el.tag}/>`;
}

/** Documento completo: declaración + root serializado. UTF-8, sin BOM. */
export function serializeDocument(root: XmlElement): string {
  return `${XML_DECLARATION}\n${serializeElement(root, 0)}`;
}

/** Redondeo monetario estable a 2 decimales (evita -0). */
export function money2(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** Formatea a string con exactamente 2 decimales. */
export function money2str(n: number): string {
  return money2(n).toFixed(2);
}

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * v335 — Zona horaria fiscal: el Formato e-CF v1.0 OFICIAL define
 * `FechaHoraFirma` como "dd-MM-AAAA HH:mm:ss; Zona horaria GMT -4" (hora local
 * dominicana, AST, sin horario de verano). Antes se formateaba en UTC: una
 * emisión de 20:00-23:59 hora RD caía en el día SIGUIENTE. RD no tiene DST →
 * el corrimiento fijo de -4h es exacto.
 */
const AST_OFFSET_MS = 4 * 3_600_000; // GMT-4 fijo (República Dominicana, sin DST)
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convierte una fecha ISO a formato DGII `DD-MM-YYYY` (FechaValidationType).
 * - "YYYY-MM-DD" (fecha de calendario, sin hora) → se respeta tal cual (sin corrimiento).
 * - Timestamps completos → se expresan en hora dominicana (GMT-4, oficial).
 * Lanza si la fecha es inválida.
 */
export function isoToDgiiDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error(`Fecha inválida: ${iso}`);
  const d = DATE_ONLY_RE.test(iso.trim()) ? new Date(t) : new Date(t - AST_OFFSET_MS);
  return `${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/**
 * Convierte ISO a `DD-MM-YYYY HH:MM:SS` (DateTimeValidationType, FechaHoraFirma)
 * en hora local dominicana (GMT-4 — requisito textual del Formato e-CF v1.0).
 */
export function isoToDgiiDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error(`Fecha/hora inválida: ${iso}`);
  const d = new Date(t - AST_OFFSET_MS);
  return (
    `${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ` +
    `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`
  );
}
