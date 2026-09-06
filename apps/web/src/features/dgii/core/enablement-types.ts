/**
 * Tipos del wizard de habilitación DGII (Fase 9). Puro/local: NO envía a DGII.
 */
import type { DgiiSendEnvironmentFlags } from "./killswitches";

export type EnablementStatus =
  | "not_started"
  | "in_progress"
  | "missing_configuration"
  | "missing_certificate"
  | "missing_sequences"
  | "missing_representative_authorization"
  | "local_preflight_ready"
  | "ready_for_testecf_blocked"
  | "ready_for_testecf";

export type AttestationStatus = "pending" | "completed" | "not_applicable";

/** Las 9 evidencias del representante e-CF (orden oficial). */
export const REPRESENTATIVE_ITEM_KEYS = [
  "titular_certificado_identificado",
  "cedula_representante_archivada",
  "rnc_emisor_validado",
  "relacion_representante_empresa",
  "designacion_usuario_administrador_ecf",
  "entidad_certificadora_identificada",
  "vigencia_certificado_revisada",
  "revocacion_crl_ocsp_revisada",
  "acta_autorizacion_interna",
] as const;

export type RepresentativeItemKey = (typeof REPRESENTATIVE_ITEM_KEYS)[number];

export const REPRESENTATIVE_ITEM_LABELS: Record<RepresentativeItemKey, string> = {
  titular_certificado_identificado: "Titular del certificado identificado",
  cedula_representante_archivada: "Cédula del representante archivada (referencia)",
  rnc_emisor_validado: "RNC del emisor validado",
  relacion_representante_empresa: "Relación representante–empresa acreditada",
  designacion_usuario_administrador_ecf: "Designación de usuario administrador e-CF",
  entidad_certificadora_identificada: "Entidad certificadora identificada",
  vigencia_certificado_revisada: "Vigencia del certificado revisada",
  revocacion_crl_ocsp_revisada: "Revocación CRL/OCSP revisada",
  acta_autorizacion_interna: "Acta de autorización interna",
};

export type RepresentativeEvidence = {
  itemKey: RepresentativeItemKey;
  status: AttestationStatus;
  responsibleName: string | null;
  evidenceDate: string | null;
  documentReference: string | null;
  notes: string | null;
  updatedAt: string | null;
};

/**
 * v330 — Hints ESPECÍFICOS por evidencia para la UI (solo placeholders/ayuda;
 * mismo schema, mismos campos, cero cambio de validación ni de datos). Caso
 * real: los 9 placeholders genéricos idénticos ("Nombre", "Acta #, folio…")
 * llevaron al dueño a llenar todo con N/A/RNC/genéricos (v326).
 */
export type RepresentativeItemHints = { responsable: string; referencia: string; nota: string };

export const REPRESENTATIVE_ITEM_HINTS: Record<RepresentativeItemKey, RepresentativeItemHints> = {
  titular_certificado_identificado: {
    responsable: "Nombre de quien verificó el certificado",
    referencia: "Certificado Viafirma · serial o fingerprint",
    nota: "Ej.: titular y tipo de certificado verificados",
  },
  cedula_representante_archivada: {
    responsable: "Nombre de quien verificó el expediente",
    referencia: "Expediente, carpeta o folio donde está archivada",
    nota: "No escribas el número completo de la cédula",
  },
  rnc_emisor_validado: {
    responsable: "Nombre de quien realizó la consulta DGII",
    referencia: "Consulta RNC DGII · fecha y resultado",
    nota: "Ej.: RNC activo · Facturador Electrónico SÍ",
  },
  relacion_representante_empresa: {
    responsable: "Nombre de quien revisó el documento",
    referencia: "Acta, poder o Registro Mercantil · No./folio",
    nota: "Identifica el documento real, sin copiar datos sensibles innecesarios",
  },
  designacion_usuario_administrador_ecf: {
    responsable: "Nombre de quien verificó OFV",
    referencia: "Constancia OFV · administrador e-CF · fecha",
    nota: "Completar solo después de verificar en OFV",
  },
  entidad_certificadora_identificada: {
    responsable: "Nombre de quien verificó la entidad certificadora",
    referencia: "Viafirma · RNC/Issuer/fingerprint del certificado",
    nota: "No usar VIAFIRMA como nombre del responsable",
  },
  vigencia_certificado_revisada: {
    responsable: "Nombre de quien revisó la vigencia",
    referencia: "Certificado · serial · vigencia verificada",
    nota: "La fecha del campo es la fecha de revisión, no la fecha de vencimiento",
  },
  revocacion_crl_ocsp_revisada: {
    responsable: "Nombre de quien realizó la verificación",
    referencia: "OCSP/CRL · resultado · fecha · referencia",
    nota: "Ej.: OCSP GOOD + CRL serial no listado",
  },
  acta_autorizacion_interna: {
    responsable: "Nombre de quien revisó el acta firmada",
    referencia: "Acta No. · fecha · referencia de archivo",
    nota: "No marcar completado sin acta real firmada",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// v326 — Integridad de evidencias (FUENTE ÚNICA: evaluator + schema Zod + UI).
// Causa real: el anti-bypass solo exigía "no vacío", así que "N/A" en las 9
// referencias, un RNC/cédula como responsable y una fecha FUTURA producían un
// 9/9 documentalmente falso. Estos helpers son puros (sin zod, sin I/O).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿El VALOR COMPLETO es un placeholder evidente? (normaliza trim/case/puntuación).
 * Solo matchea el valor entero o patrones equivalentes ("N/A", "n.a.", "---",
 * "xxx", "pendiente"); un texto real que CONTIENE "no aplica" dentro de una
 * frase mayor NO falla.
 */
export function isPlaceholderText(v: string | null | undefined): boolean {
  if (typeof v !== "string") return true;
  const t = v.trim();
  if (t.length === 0) return true;
  const norm = t.toLowerCase().replace(/[\s./\\-]+/g, "");
  if (norm.length === 0) return true; // solo puntuación/espacios ("---", "...", "*")
  const PLACEHOLDERS = new Set(["na", "n/a", "noaplica", "pendiente", "todo", "test", "prueba", "ninguna", "ninguno", "no", "si", "ok"]);
  if (PLACEHOLDERS.has(norm)) return true;
  if (/^[x*]+$/.test(norm)) return true; // "xxx", "*", "x"
  return false;
}

/** Fecha de VERIFICACIÓN: YYYY-MM-DD válida y NO futura (comparación en UTC). */
export function isValidVerificationDate(v: string | null | undefined): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  // "hoy" en UTC al final del día: una evidencia fechada hoy siempre pasa,
  // independiente del huso del servidor/navegador.
  return t <= Date.parse(new Date().toISOString().slice(0, 10) + "T23:59:59Z");
}

/** Términos genéricos que NO identifican a una persona verificadora (valor completo). */
const GENERIC_RESPONSIBLES = new Set([
  "representante", "administrador", "contador", "gerente", "encargado", "titular",
  "empresa", "viafirma", "dgii", "avansi", "sistema", "usuario", "admin",
]);

/**
 * Responsable = persona real que verificó. Rechaza placeholders, valores solo
 * numéricos (cédulas/RNC), y términos genéricos solos. NO exige un nombre
 * específico ni formato rígido: cualquier nombre humano razonable pasa.
 */
export function isValidResponsibleName(v: string | null | undefined): boolean {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (isPlaceholderText(t)) return false;
  if (/^[\d\s.\-/]+$/.test(t)) return false; // solo dígitos/puntuación → cédula/RNC, no persona
  if ((t.match(/\p{L}/gu) ?? []).length < 3) return false; // al menos 3 letras reales
  if (GENERIC_RESPONSIBLES.has(t.toLowerCase())) return false; // término genérico solo
  return true;
}

/**
 * v341 — Marcador de plantilla SIN COMPLETAR. Las sugerencias automáticas
 * honestas (#3 RNC) prellenan "resultado: (completar tras la consulta)"; si el
 * usuario guarda sin editar, la referencia supera los 8 chars y no es
 * placeholder → contaba como válida afirmando una consulta que no ocurrió.
 */
export function hasUnfinishedTemplateMarker(v: string | null | undefined): boolean {
  return typeof v === "string" && /\(completar/i.test(v);
}

/** Referencia documental: no placeholder y con contenido mínimo identificable. */
export function isValidDocumentReference(v: string | null | undefined): boolean {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (isPlaceholderText(t)) return false;
  if (hasUnfinishedTemplateMarker(t)) return false; // plantilla a medio completar (v341)
  return t.length >= 8; // "N/A", ".", "123" no identifican nada; una referencia real sí
}

/**
 * Motivo por el que una evidencia NO cuenta para el Paso 9 (null = válida).
 * Única fuente de verdad: el evaluator la usa como booleano y la UI como mensaje.
 */
export function attestationSupportIssue(ev: RepresentativeEvidence | undefined): string | null {
  if (!ev) return "Evidencia sin registrar.";
  if (ev.status === "completed") {
    if (!isValidResponsibleName(ev.responsibleName)) {
      return "El responsable debe ser una persona verificadora (no un RNC, cédula, entidad o término genérico).";
    }
    if (!isValidVerificationDate(ev.evidenceDate)) {
      return "La fecha de verificación debe ser YYYY-MM-DD y no puede estar en el futuro.";
    }
    if (hasUnfinishedTemplateMarker(ev.documentReference)) {
      return "La referencia todavía dice “(completar…)”: realiza la verificación externa y escribe el resultado real antes de marcarla completada.";
    }
    if (!isValidDocumentReference(ev.documentReference)) {
      return "La referencia documental no puede ser un placeholder como “N/A”: identifica el documento real (serial, número de acta, consulta, expediente…).";
    }
    return null;
  }
  if (ev.status === "not_applicable") {
    return isPlaceholderText(ev.notes) ? "“No aplica” exige una nota explicativa real (no “N/A”)." : null;
  }
  return "Evidencia pendiente.";
}

export type EnablementChecklistItem = {
  step: number;
  key: string;
  label: string;
  ok: boolean;
  /** Requerido para ready_for_testecf. */
  required: boolean;
  hint?: string;
};

export type EnablementEvaluatorInput = {
  settings: { configured: boolean; ambiente: string | null; dgiiEnabledRealSend: boolean } | null;
  certificate: { active: boolean; expired: boolean };
  sequences: { hasActive: boolean };
  dryRun: { recorded: boolean; signedAndVerified: boolean; xsdValid: boolean; ok: boolean } | null;
  /**
   * v320 — Resultado de la prueba de firma local (test-local, certificado REAL).
   * Evidencia equivalente para pasos 6 (firma) y 7 (XSD): test-local firma, verifica y
   * valida XSD con los mismos signer/validador canónicos que el dry-run. El paso 8
   * (dry-run ejecutado) sigue exigiendo el dry-run (builder + preflight completos).
   * Opcional para compat: sin este campo el checklist se comporta como antes.
   */
  testLocal?: { ok: boolean; signedAndVerified: boolean; xsdValid: boolean } | null;
  representative: RepresentativeEvidence[];
  declarationAccepted: boolean;
  /** Gates externos DGII — en Fase 9 quedan en false (no se asumen aprobados). */
  postulationConfirmed?: boolean;
  rangeAuthorized?: boolean;
  /**
   * v524 — ¿Hay al menos un rango del ambiente PRODUCTIVO cargado y activo?
   *
   * Es un hecho que AgendApp puede ver, a diferencia de `rangeAuthorized`, que es una
   * casilla que el dueño tilda a mano. Un rango productivo no aparece por accidente:
   * sale del PDF de autorización de DGII.
   */
  hasProductionRange?: boolean;
  canWriteDgii: boolean;
  envFlags: DgiiSendEnvironmentFlags;
};

export type EnablementEvaluation = {
  status: EnablementStatus;
  progressPercent: number;
  checklist: EnablementChecklistItem[];
  blockingReasons: string[];
  warnings: string[];
  nextRecommendedAction: string;
};
