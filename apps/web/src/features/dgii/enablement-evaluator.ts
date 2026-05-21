/**
 * Evaluador de habilitación DGII.
 *
 * Inspecciona el progreso de cada paso y el estado del certificado mock
 * y produce:
 *   1. Un diagnóstico por dimensión (completo / pendiente / bloqueado).
 *   2. El estado global de habilitación (uno de 8 valores definidos).
 *   3. La sugerencia del próximo paso.
 *
 * Es pura: recibe estado, devuelve estado. No toca localStorage ni
 * hace fetch.
 */

import {
  dgiiEnablementSteps,
  type EnablementStepDef,
} from "@/lib/mock-data/dgii-enablement";
import type {
  EnablementProgress,
  EnablementStatus,
  EnablementStepId,
} from "./enablement-store";
import type {
  CertificateMockState,
  CertificateStatus,
} from "./certificate-status-store";

export type EnablementGlobalStatus =
  | "not_started"
  | "in_preparation"
  | "blocked_by_certificate"
  | "blocked_by_fiscal_config"
  | "ready_for_testecf"
  | "in_certification"
  | "certified_by_dgii"
  | "ready_for_fiscal_production";

export const ENABLEMENT_GLOBAL_STATUS_LABEL: Record<
  EnablementGlobalStatus,
  string
> = {
  not_started: "No iniciado",
  in_preparation: "En preparación",
  blocked_by_certificate: "Bloqueado por certificado",
  blocked_by_fiscal_config: "Bloqueado por configuración fiscal",
  ready_for_testecf: "Listo para testecf",
  in_certification: "En certificación",
  certified_by_dgii: "Certificado por DGII",
  ready_for_fiscal_production: "Listo para producción fiscal",
};

export const ENABLEMENT_GLOBAL_STATUS_TONE: Record<
  EnablementGlobalStatus,
  "neutral" | "info" | "warning" | "danger" | "success" | "primary"
> = {
  not_started: "neutral",
  in_preparation: "info",
  blocked_by_certificate: "danger",
  blocked_by_fiscal_config: "danger",
  ready_for_testecf: "primary",
  in_certification: "warning",
  certified_by_dgii: "success",
  ready_for_fiscal_production: "success",
};

export interface DimensionDiagnostic {
  stepId: EnablementStepId;
  title: string;
  status: EnablementStatus;
  /** Síntesis de una línea de la situación. */
  summary: string;
  /** Sugerencia accionable. */
  recommendation: string;
  /** Si está bloqueado por una fase futura. */
  blocked: boolean;
}

export interface EnablementEvaluation {
  globalStatus: EnablementGlobalStatus;
  globalSummary: string;
  /** Diagnósticos por paso (excluye estado_final). */
  diagnostics: DimensionDiagnostic[];
  /** Conteos. */
  totals: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    pending: number;
  };
  /** Próximo paso accionable, o null si no hay. */
  nextStep: EnablementStepDef | null;
  /** Marca de tiempo en que se calculó. */
  evaluatedAt: string;
  /** Recordatorio MOCK / DEMO siempre presente. */
  mockNotice: string;
}

const MOCK_NOTICE =
  "Evaluación MOCK / DEMO / NO FISCAL — no representa un estado real ante DGII hasta autorizar Fases C/F/G/H.";

function resolveStatus(
  step: EnablementStepDef,
  progress: EnablementProgress | undefined,
): EnablementStatus {
  return progress?.status ?? step.defaultStatus;
}

function inferStatusFromCertificate(
  step: EnablementStepDef,
  progress: EnablementProgress | undefined,
  cert: CertificateMockState,
): EnablementStatus {
  // Si el usuario marcó el step manualmente, respetamos eso.
  if (progress) return progress.status;
  // Si no, derivamos del estado del certificado mock.
  switch (cert.status) {
    case "valid":
    case "uploaded":
      return "in_progress";
    case "expired":
    case "invalid":
      return "blocked";
    case "not_uploaded":
    default:
      return step.defaultStatus;
  }
}

function dimensionDiagnostic(
  step: EnablementStepDef,
  progress: EnablementProgress | undefined,
  cert: CertificateMockState,
): DimensionDiagnostic {
  let status: EnablementStatus;
  let summary: string;
  let recommendation: string;
  const blocked = Boolean(step.blockedReason);

  if (step.dimension === "certificate") {
    status = inferStatusFromCertificate(step, progress, cert);
    summary = certificateSummary(cert);
    recommendation = certificateRecommendation(cert);
  } else {
    status = resolveStatus(step, progress);
    const done = progress?.checklist.filter((c) => c.done).length ?? 0;
    const total = step.checklist.length;
    summary =
      status === "completed"
        ? `${step.title} marcado como finalizado`
        : status === "in_progress"
          ? `${done}/${total} items completados`
          : status === "blocked"
            ? (progress?.blockerReason ?? step.blockedReason ?? "Bloqueado")
            : "Pendiente de iniciar";
    recommendation =
      status === "completed"
        ? "Sin acción pendiente"
        : status === "blocked"
          ? "Resolver el bloqueo o esperar autorización de fase"
          : `Completar checklist en /dgii/habilitacion`;
  }

  return {
    stepId: step.id,
    title: step.title,
    status,
    summary,
    recommendation,
    blocked,
  };
}

function certificateSummary(cert: CertificateMockState): string {
  switch (cert.status) {
    case "not_uploaded":
      return "Sin certificado cargado";
    case "uploaded":
      return cert.alias
        ? `Certificado "${cert.alias}" cargado, pendiente validación`
        : "Certificado cargado, pendiente validación";
    case "valid":
      return cert.validTo
        ? `Certificado válido (vence ${cert.validTo})`
        : "Certificado válido";
    case "expired":
      return cert.validTo
        ? `Certificado vencido el ${cert.validTo}`
        : "Certificado vencido";
    case "invalid":
      return "Certificado inválido o no aceptado";
  }
}

function certificateRecommendation(cert: CertificateMockState): string {
  switch (cert.status) {
    case "not_uploaded":
      return "Subir el certificado en /dgii/certificado (modo mock).";
    case "uploaded":
      return "Validar la vigencia y marcar como activo.";
    case "valid":
      return "Avanzar al paso 2 (Configuración fiscal).";
    case "expired":
      return "Renovar el certificado con la Autoridad Certificadora.";
    case "invalid":
      return "Verificar archivo / contraseña; volver a cargar.";
  }
}

function gatherTotals(diagnostics: DimensionDiagnostic[]) {
  let completed = 0;
  let inProgress = 0;
  let blocked = 0;
  let pending = 0;
  for (const d of diagnostics) {
    if (d.status === "completed") completed++;
    else if (d.status === "in_progress") inProgress++;
    else if (d.status === "blocked") blocked++;
    else pending++;
  }
  return {
    total: diagnostics.length,
    completed,
    inProgress,
    blocked,
    pending,
  };
}

function pickGlobalStatus(
  diagnostics: DimensionDiagnostic[],
  cert: CertificateStatus,
): EnablementGlobalStatus {
  const byId = new Map(diagnostics.map((d) => [d.stepId, d]));
  const has = (id: EnablementStepId, ...statuses: EnablementStatus[]) => {
    const s = byId.get(id);
    return s ? statuses.includes(s.status) : false;
  };

  // 1. Nada empezado.
  const allPending = diagnostics.every((d) => d.status === "pending");
  if (allPending && cert === "not_uploaded") return "not_started";

  // 2. Bloqueos críticos.
  if (cert === "expired" || cert === "invalid") return "blocked_by_certificate";
  if (cert === "not_uploaded" && diagnostics.some((d) => d.status !== "pending"))
    return "blocked_by_certificate";
  if (
    (cert === "uploaded" || cert === "valid") &&
    !has("configuracion_fiscal", "completed", "in_progress")
  )
    return "blocked_by_fiscal_config";

  // 3. Listo para producción fiscal: roles + pruebas + reps + URLs + declaración + postulación + representante completos.
  const completedAll = [
    "configuracion_fiscal",
    "postulacion",
    "pruebas_ecf",
    "representaciones",
    "url_produccion",
    "declaracion_jurada",
    "autorizacion_representante",
    "roles_ncf",
  ].every((id) => byId.get(id as EnablementStepId)?.status === "completed");
  if (completedAll && cert === "valid") return "ready_for_fiscal_production";

  // 4. Certificado por DGII: postulación + declaración + autorización de representante completas.
  if (
    has("postulacion", "completed") &&
    has("declaracion_jurada", "completed") &&
    has("autorizacion_representante", "completed")
  )
    return "certified_by_dgii";

  // 5. En certificación: pruebas + reps + URLs avanzadas o postulación in_progress.
  if (
    has("pruebas_ecf", "completed") &&
    has("representaciones", "completed") &&
    (has("postulacion", "in_progress", "completed") ||
      has("url_produccion", "in_progress", "completed"))
  )
    return "in_certification";

  // 6. Listo para testecf: certificado válido + config fiscal + autorización del representante e-CF.
  //    El gate de representante es CRÍTICO: DGII no acepta envíos sin Usuario
  //    Administrador e-CF confirmado, aunque el cert sea técnicamente válido.
  if (
    cert === "valid" &&
    has("configuracion_fiscal", "completed") &&
    has("autorizacion_representante", "completed") &&
    !has("pruebas_ecf", "completed")
  )
    return "ready_for_testecf";

  // 7. Default: en preparación.
  return "in_preparation";
}

function pickNextStep(
  diagnostics: DimensionDiagnostic[],
): EnablementStepDef | null {
  for (const step of dgiiEnablementSteps) {
    if (step.readOnly) continue;
    const d = diagnostics.find((dd) => dd.stepId === step.id);
    if (!d) continue;
    if (d.status === "completed") continue;
    return step;
  }
  return null;
}

export function evaluateEnablement(
  progressList: EnablementProgress[],
  cert: CertificateMockState,
): EnablementEvaluation {
  const actionableSteps = dgiiEnablementSteps.filter((s) => !s.readOnly);
  const diagnostics = actionableSteps.map((step) => {
    const progress = progressList.find((p) => p.stepId === step.id);
    return dimensionDiagnostic(step, progress, cert);
  });

  const totals = gatherTotals(diagnostics);
  const globalStatus = pickGlobalStatus(diagnostics, cert.status);
  const nextStep = pickNextStep(diagnostics);

  return {
    globalStatus,
    globalSummary: ENABLEMENT_GLOBAL_STATUS_LABEL[globalStatus],
    diagnostics,
    totals,
    nextStep,
    evaluatedAt: new Date().toISOString(),
    mockNotice: MOCK_NOTICE,
  };
}
