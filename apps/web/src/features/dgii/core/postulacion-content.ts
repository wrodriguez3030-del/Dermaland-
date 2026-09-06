import { extractTag } from "./xml-extract";
import { ECF_TIPO_LABELS } from "./builder-types";
import { getDeclarableTipos } from "./ecf-capabilities";

/**
 * v339 — Contenido de la POSTULACIÓN DGII: parse + validación de negocio ANTES
 * de firmar. Caso real (PostulacionID 76215, auditoría 2026-07-09): el portal
 * generó una postulación con tipos 41-47 (que AgendApp rechaza por diseño),
 * URLs base sin el base-path del tenant, autenticación declarada sin servicio,
 * y versión tipeada a mano ("50"). Firmar y subir eso compromete la
 * certificación (el set de pruebas se arma según lo declarado y un Rechazado
 * reinicia el set). Este módulo REUTILIZA el parser canónico (extractTag) y la
 * fuente ÚNICA de tipos soportados (ECF_TIPOS_BUILDER) — cero segundo
 * classifier/evaluator: la clasificación sigue siendo de xml-classifier; aquí
 * solo se valida el CONTENIDO de un XML ya clasificado como postulación.
 */

// v355 — los labels viven en builder-types (leaf); re-export para consumidores.
export { ECF_TIPO_LABELS };

/**
 * Tipos DECLARABLES en la postulación DGII — v355: DINÁMICO por readiness real
 * (`getDeclarableTipos()` = emitible por software ∧ ECF_TIPOS_POSTULACION).
 * Hoy ≡ 31,32,33,34 (anclado por test). Si un tipo declarado perdiera builder o
 * XSD, cae de la lista AUTOMÁTICAMENTE (fail-safe, jamás soporte falso).
 * Ampliar la postulación = decisión del dueño (checkpoint §8) + certificación.
 */
export const SUPPORTED_ECF_TIPOS: readonly string[] = getDeclarableTipos();

/**
 * v375 — Versión declarada en la POSTULACIÓN DGII. **Separada de la versión
 * interna/SemVer de la app** (`package.json`, hoy 1.0.0): el campo `VersionSoftware`
 * del XML de postulación es un `xsd:double`, y "1.0.0" NO es un double válido —
 * el Portal de Certificación lo rechaza. Incidente real 2026-07-16:
 * "The value '1.0.0' is invalid according to its datatype ...:double".
 * Esta constante es la fuente canónica ÚNICA de la versión de postulación; el
 * NombreSoftware sigue viniendo de `package.json` (agendapps).
 */
export const DGII_POSTULATION_SOFTWARE_VERSION = "1.0";

/** ¿El texto es un `xsd:double` válido? (número decimal/exponencial; "1.0.0" NO lo es). */
export function isValidXsdDouble(v: string): boolean {
  const t = v.trim();
  return t !== "" && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t);
}

export type ParsedPostulacion = {
  postulacionId: string | null;
  grupoComprobante: string[];
  rncContribuyente: string | null;
  razonSocial: string | null;
  rncRepresentante: string | null;
  nombreRepresentante: string | null;
  nombreSoftware: string | null;
  versionSoftware: string | null;
  urlRecepcion: string | null;
  urlAprobacionComercial: string | null;
  urlAutenticacion: string | null;
  signaturePresent: boolean;
};

/** Parse tolerante de la postulación (root <Postulacion>, formato del portal). */
export function parsePostulacion(xml: string): ParsedPostulacion | null {
  if (!/<(?:\w+:)?Postulacion[\s>]/i.test(xml)) return null;
  const grupo = extractTag(xml, "GrupoComprobante");
  return {
    postulacionId: extractTag(xml, "PostulacionID"),
    grupoComprobante: grupo ? grupo.split(",").map((t) => t.trim()).filter(Boolean) : [],
    rncContribuyente: extractTag(xml, "RNCContribuyente"),
    razonSocial: extractTag(xml, "RazonSocial"),
    rncRepresentante: extractTag(xml, "RNCRepresentante"),
    nombreRepresentante: extractTag(xml, "NombreRepresentante"),
    nombreSoftware: extractTag(xml, "NombreSoftware"),
    versionSoftware: extractTag(xml, "VersionSoftware"),
    urlRecepcion: extractTag(xml, "UrlRecepcion"),
    urlAprobacionComercial: extractTag(xml, "UrlAprobacionComercial"),
    urlAutenticacion: extractTag(xml, "UrlAutenticacion"),
    signaturePresent: /<(?:\w+:)?SignatureValue[\s>]/.test(xml),
  };
}

export type PostulacionExpectations = {
  /** RNC del emisor del tenant (dgii_settings). */
  tenantRnc: string | null;
  /** Cédula/RNC del titular del certificado ACTIVO (serialNumber IDCDO-… → dígitos). */
  certHolderId: string | null;
  /** Versión canónica de la app (package.json). */
  appVersion: string;
  /** v368 — nombre canónico del software (package.json). Mismatch = blocker. */
  expectedNombre: string;
  /** v368 — gate Auth (DGII_FE_AUTH_ENABLED). OFF → UrlAutenticacion declarada = blocker. */
  authEnabled: boolean;
  /** Base declarable de URLs: host público + base-path del tenant (sin https://). */
  expectedUrlBase: string | null;
};

export type PostulacionValidation = {
  ok: boolean;
  /** Impiden firmar (el endpoint los rechaza con 422). */
  blockers: string[];
  /** No bloquean, pero se muestran. */
  warnings: string[];
};

const normUrl = (u: string | null): string =>
  (u ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

/**
 * Valida el CONTENIDO de una postulación contra la capacidad real de AgendApp
 * y la identidad del tenant. PURO (las expectativas llegan resueltas).
 */
export function validatePostulacionContent(
  p: ParsedPostulacion,
  exp: PostulacionExpectations,
): PostulacionValidation {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Tipos declarados ⊆ soportados (fuente única del builder canónico).
  const unsupported = p.grupoComprobante.filter((t) => !SUPPORTED_ECF_TIPOS.includes(t));
  if (p.grupoComprobante.length === 0) {
    blockers.push("La postulación no declara tipos de e-CF (GrupoComprobante vacío).");
  }
  if (unsupported.length > 0) {
    blockers.push(
      `Esta postulación declara tipos e-CF que esta versión de AgendApp no soporta: ${unsupported
        .map((t) => `${t} (${ECF_TIPO_LABELS[t] ?? "desconocido"})`)
        .join(", ")}. Regenera la postulación declarando solo ${SUPPORTED_ECF_TIPOS.join(", ")}.`,
    );
  }
  // v368 — postulación ALL-TYPES: el conjunto debe estar COMPLETO. Declarar un
  // subconjunto (p. ej. el histórico 31-34) armaría un set de certificación
  // incompleto y obligaría a re-postular.
  const missing = SUPPORTED_ECF_TIPOS.filter((t) => !p.grupoComprobante.includes(t));
  if (p.grupoComprobante.length > 0 && missing.length > 0) {
    blockers.push(
      `Faltan tipos en GrupoComprobante: ${missing.join(", ")}. La postulación vigente declara los 10 tipos soportados (${SUPPORTED_ECF_TIPOS.join(",")}) — el 42 queda excluido.`,
    );
  }
  // v368 — nombre del software: EXACTO al canónico (el set de pruebas se emite a nombre del software declarado).
  if (p.nombreSoftware && p.nombreSoftware.trim() !== exp.expectedNombre) {
    blockers.push(
      `NombreSoftware declara "${p.nombreSoftware}" y el nombre canónico es "${exp.expectedNombre}". Corregilo en el portal antes de generar el archivo.`,
    );
  }

  // RNC del contribuyente = RNC del tenant.
  if (exp.tenantRnc && p.rncContribuyente && p.rncContribuyente !== exp.tenantRnc) {
    blockers.push(`El RNC de la postulación (${p.rncContribuyente}) no es el RNC configurado del negocio (${exp.tenantRnc}).`);
  }

  // Representante = titular del certificado activo (evita el rechazo CA5241).
  if (exp.certHolderId && p.rncRepresentante) {
    const repDigits = p.rncRepresentante.replace(/\D/g, "");
    const holderDigits = exp.certHolderId.replace(/\D/g, "");
    if (holderDigits && repDigits !== holderDigits) {
      blockers.push(
        `El representante de la postulación (${p.nombreRepresentante ?? p.rncRepresentante}) no coincide con el titular del certificado activo — el portal rechazaría la firma (CA5241).`,
      );
    }
  }

  // URLs de servicios: el portal concatena /fe/… al host declarado → el host
  // debe incluir el base-path del tenant y NADA más (sin sufijos técnicos,
  // sin query/fragment, sin paths extra). normUrl solo tolera equivalencias
  // seguras: mayúsculas, protocolo y trailing slash.
  if (exp.expectedUrlBase) {
    const base = normUrl(exp.expectedUrlBase);
    for (const [label, val] of [
      ["UrlRecepcion", p.urlRecepcion],
      ["UrlAprobacionComercial", p.urlAprobacionComercial],
    ] as const) {
      if (!val || normUrl(val) === base) continue;
      // v346 — caso real de la postulación regenerada: el usuario pegó la RUTA
      // TÉCNICA completa (base + /fe/…) en el campo del portal. Mensaje
      // específico y accionable (mismo blocker; nada se debilita).
      if (normUrl(val).startsWith(`${base}/fe/`)) {
        blockers.push(
          `${label} declara la ruta técnica completa (“${val}”). En el Portal DGII se declara SOLO la URL base “${exp.expectedUrlBase}” — NO incluyas /fe/recepcion/api/ecf ni /fe/aprobacioncomercial/api/ecf: el portal concatena esos sufijos automáticamente (con el valor actual DGII probaría …/fe/…/fe/…, una URL inexistente).`,
        );
      } else {
        blockers.push(
          `${label} declara “${val}” pero el servicio del negocio vive en “${exp.expectedUrlBase}” (el portal concatena /fe/… al host declarado — con el valor actual DGII probaría una URL inexistente). Declarala EXACTAMENTE como la muestra AgendApp en “Datos para copiar en el Portal DGII”, sin rutas extra, query ni fragmentos.`,
        );
      }
    }
  }

  // Autenticación: OPCIONAL en el estándar. v347: el servicio existe pero está
  // APAGADO (gate). Contrato oficial: si se declara, es la MISMA URL base que
  // los demás servicios (el portal concatena /fe/autenticacion/… fijo).
  // → declarada con valor INCOMPATIBLE = blocker (DGII probaría una URL ajena
  //   o inexistente); declarada con la base correcta = warning (recomendado hoy:
  //   VACÍA hasta activar el servicio); vacía = ok.
  if (p.urlAutenticacion && p.urlAutenticacion.trim() !== "") {
    const auth = normUrl(p.urlAutenticacion);
    const base = exp.expectedUrlBase ? normUrl(exp.expectedUrlBase) : null;
    if (base && auth.startsWith(`${base}/fe/`)) {
      blockers.push(
        `UrlAutenticacion declara la ruta técnica completa (“${p.urlAutenticacion}”). Si quieres declarar autenticación va SOLO la URL base “${exp.expectedUrlBase}” (el portal concatena /fe/autenticacion/… automáticamente) — y hoy lo recomendado es dejarla VACÍA (el servicio está apagado).`,
      );
    } else if (base && auth !== base) {
      blockers.push(
        `UrlAutenticacion declara “${p.urlAutenticacion}”, que no corresponde a este negocio (base esperada: “${exp.expectedUrlBase}”). Déjala VACÍA (recomendado: el servicio está apagado) o declarala EXACTAMENTE igual a la base.`,
      );
    } else if (!exp.authEnabled) {
      // v368 — gate Auth OFF: declararla (aunque sea con la base correcta) haría
      // que DGII pruebe un servicio apagado → BLOCKER hasta activar el gate.
      blockers.push(
        "UrlAutenticacion viene declarada pero el servicio de autenticación está APAGADO (gate OFF). Déjala VACÍA al regenerar; si el dueño activa el servicio antes de las pruebas, la re-declaras con la misma URL base.",
      );
    } else {
      warnings.push(
        "UrlAutenticacion declarada con el servicio activo: verifica el smoke de /t/{slug}/fe/autenticacion antes de subir la postulación.",
      );
    }
  }

  // Versión: v375 — DGII exige un xsd:double (incidente real: "1.0.0" no lo es).
  // Primero se valida el FORMATO (mensaje específico y accionable), luego la
  // coincidencia con la versión de postulación canónica ("1.0"). BLOCKER: la
  // versión declarada queda amarrada al set de certificación.
  if (p.versionSoftware) {
    const v = p.versionSoftware.trim();
    if (!isValidXsdDouble(v)) {
      blockers.push(
        `VersionSoftware “${p.versionSoftware}” no es un valor numérico válido para DGII (el campo es xsd:double). Usa “${exp.appVersion}” — por ejemplo “1.0.0” (SemVer) NO es válido; el correcto es “1.0”.`,
      );
    } else if (v !== exp.appVersion) {
      blockers.push(
        `VersionSoftware declara “${p.versionSoftware}” y la versión de postulación DGII es “${exp.appVersion}”. Corregila en el formulario del portal antes de generar el archivo.`,
      );
    }
  }

  return { ok: blockers.length === 0, blockers, warnings };
}
