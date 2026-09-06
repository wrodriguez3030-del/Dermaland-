/**
 * v335 — Fundación PURA de la Representación Impresa (RI) oficial de e-CF.
 * Fuente: "Informe Técnico e-CF v1.0" §18 (vigente, verificado 2026-07-09) +
 * ejemplo real de ConsultaTimbre del ambiente CerteCF.
 *
 * Requisitos oficiales implementados aquí (solo helpers; la RI completa —
 * layout, PDF, QR gráfico — es fase posterior):
 *  - Código de seguridad: "los primeros seis (6) dígitos del hash generado en
 *    el SignatureValue de la firma digital del e-CF". El ejemplo oficial
 *    (CodigoSeguridad=cZVCxn) contiene mayúsculas/minúsculas → NO es hex: son
 *    los primeros 6 caracteres del SignatureValue en base64. Esta
 *    interpretación queda marcada para CONFIRMAR en TestECF antes de usarla en
 *    una RI real.
 *  - URL del QR (consulta del timbre): e-CF regular →
 *    https://ecf.dgii.gov.do/{amb}/ConsultaTimbre?RncEmisor&RncComprador&ENCF&
 *    FechaEmision(dd-MM-aaaa)&MontoTotal&FechaFirma(dd-MM-aaaa HH:mm:ss)&CodigoSeguridad.
 *    FC<250k → https://fc.dgii.gov.do/{amb}/ConsultaTimbreFC?RncEmisor&ENCF&
 *    MontoTotal&CodigoSeguridad.
 *  - Geometría del QR (documental, para la fase de render): versión 8, mínimo
 *    22×22 mm, margen 3 mm, esquina inferior izquierda, ≥2 cm del borde.
 *
 * Sin red, sin DB, sin FS. No genera imágenes.
 */

/**
 * v584 — El e-NCF tal como la representación impresa lo necesita: `E` + 2 dígitos de tipo
 * + 10 de secuencia.
 *
 * En el repo conviven TRES reglas de e-NCF, y las tres tienen su motivo (v612 — v584 sólo
 * nombraba dos, que es como se unifica por error la que no tocaba):
 *
 *  1. `builder.ts` → `/^[A-Za-z0-9]{13}$/`: el `eNCFValidationType` del XSD, lo más laxo
 *     que la DGII acepta en el sobre.
 *  2. ésta → `/^E\d{2}\d{10}$/`: lo que la representación impresa necesita para poder
 *     separar tipo y secuencia y pintarlas. Es un subconjunto de la anterior.
 *  3. `builders/common.ts` → `isValidEncf`, `/^[E-OQ-Z]\d{12}$/`: para e-NCF que llegan
 *     de OTROS emisores en la recepción B2B, donde la serie puede no ser `E`.
 *
 * No se contradicen: cada una vigila una frontera distinta. Lo que no debe haber es la
 * misma regla escrita dos veces, que es como una se queda atrás.
 */
export const ENCF_IMPRESO_RE = /^E\d{2}\d{10}$/;

export type DgiiQrAmbiente = "TesteCF" | "CerteCF" | "eCF";

/** Geometría oficial del QR (Informe Técnico §18) — para la fase de render. */
export const DGII_QR_SPEC = {
  version: 8,
  minSizeMm: 22,
  marginMm: 3,
  position: "inferior-izquierda",
  minDistanceFromEdgeCm: 2,
} as const;

/** Extrae el contenido de <SignatureValue> de un XML firmado (o null). */
export function extractSignatureValue(signedXml: string): string | null {
  const m = /<(?:[A-Za-z0-9_]+:)?SignatureValue[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?SignatureValue>/.exec(signedXml);
  if (!m) return null;
  const v = m[1]!.replace(/\s+/g, "");
  return v.length > 0 ? v : null;
}

/**
 * Código de seguridad de la RI: primeros 6 caracteres del SignatureValue
 * (base64, sin espacios). Interpretación del ejemplo oficial (cZVCxn) — a
 * CONFIRMAR en TestECF. Lanza si el XML no tiene firma.
 */
export function securityCodeFromSignedXml(signedXml: string): string {
  const sig = extractSignatureValue(signedXml);
  if (!sig || sig.length < 6) throw new Error("El XML no tiene SignatureValue (¿está firmado?).");
  return sig.slice(0, 6);
}

export type ConsultaTimbreParams = {
  rncEmisor: string;
  /** Vacío permitido (consumo sin RNC del comprador). */
  rncComprador?: string | null;
  eNcf: string;
  /** dd-MM-aaaa (usar isoToDgiiDate del builder canónico). */
  fechaEmision: string;
  /** Monto total con 2 decimales o entero, como figura en el e-CF. */
  montoTotal: string;
  /** dd-MM-aaaa HH:mm:ss (usar isoToDgiiDateTime). */
  fechaFirma: string;
  codigoSeguridad: string;
};

/**
 * v424 (hotfix Paso 6) — Encoder del contrato oficial DGII para valores del timbre:
 * el ESPACIO se codifica como `%20`; los dos puntos (`:`) van LITERALES (fechafirma=
 * DD-MM-YYYY%20HH:mm:ss), igual que `-` y `.`. No usa `+` (form-encoding) ni `%3A`.
 * Como DGII decodifica la query, el valor decodificado es idéntico al de `+`/`%3A`
 * (los QR que ya abrían siguen abriendo), pero el formato ahora cumple el contrato.
 */
function encDgii(v: string): string {
  return encodeURIComponent(v).replace(/%3A/gi, ":");
}
function buildTimbreQuery(pairs: Array<[string, string | null | undefined]>): string {
  return pairs
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "") // omite vacíos (RncComprador condicional)
    .map(([k, v]) => `${k}=${encDgii(String(v))}`)
    .join("&");
}

/** URL oficial del QR para e-CF regular (ConsultaTimbre). */
export function buildConsultaTimbreUrl(ambiente: DgiiQrAmbiente, p: ConsultaTimbreParams): string {
  // RncComprador es CONDICIONAL: E43 (Gastos Menores) y E47 (Pagos al Exterior) NO lo
  // llevan → se OMITE (antes se emitía `RncComprador=` vacío → DGII no abría el QR de
  // E43/E47, rechazo 24-07-2026). Orden oficial de parámetros.
  const q = buildTimbreQuery([
    ["RncEmisor", p.rncEmisor],
    ["RncComprador", p.rncComprador],
    ["ENCF", p.eNcf],
    ["FechaEmision", p.fechaEmision],
    ["MontoTotal", p.montoTotal],
    ["FechaFirma", p.fechaFirma],
    ["CodigoSeguridad", p.codigoSeguridad],
  ]);
  return `https://ecf.dgii.gov.do/${ambiente}/ConsultaTimbre?${q}`;
}

/** URL oficial del QR para Factura de Consumo < RD$250k (ConsultaTimbreFC). */
export function buildConsultaTimbreFcUrl(
  ambiente: DgiiQrAmbiente,
  p: Pick<ConsultaTimbreParams, "rncEmisor" | "eNcf" | "montoTotal" | "codigoSeguridad">,
): string {
  // ConsultaTimbreFC NO lleva los parámetros del timbre regular (sin RncComprador,
  // FechaEmision ni FechaFirma).
  const q = buildTimbreQuery([
    ["RncEmisor", p.rncEmisor],
    ["ENCF", p.eNcf],
    ["MontoTotal", p.montoTotal],
    ["CodigoSeguridad", p.codigoSeguridad],
  ]);
  return `https://fc.dgii.gov.do/${ambiente}/ConsultaTimbreFC?${q}`;
}
