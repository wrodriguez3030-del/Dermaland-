"use client";

import * as React from "react";

/**
 * Store de progreso de habilitación DGII (mock).
 *
 * Persiste localmente en `dermaland.dgii-enablement-progress` el estado
 * declarado por el usuario para cada paso del wizard `/dgii/habilitacion`.
 *
 * NO ejecuta llamadas reales a DGII. Las acciones aquí solo mueven el
 * estado de un paso (pending → in_progress → completed | blocked |
 * requires_*). Las acciones reales (subir cert, importar secuencias,
 * enviar XML) viven en otros módulos y siguen gobernadas por su propio
 * permission gate.
 *
 * Producción (Fase futura): reemplazar por tabla
 * `dgii_enablement_progress` en Supabase con columna `business_id` y
 * RLS por tenant. Migrar este localStorage de un solo tenant a registros
 * por business.
 */

export type EnablementStepId =
  | "certificado_digital"
  | "configuracion_fiscal"
  | "postulacion"
  | "pruebas_ecf"
  | "representaciones"
  | "url_produccion"
  | "declaracion_jurada"
  | "autorizacion_representante"
  | "roles_ncf"
  | "estado_final";

export type EnablementStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "requires_user_action"
  | "requires_accountant_validation"
  | "requires_dgii_validation";

/**
 * Evidencia por ítem del checklist. Diseñada para el paso
 * `autorizacion_representante` (pre-Fase G), donde cada confirmación
 * necesita trazabilidad para auditoría. Otros pasos pueden seguir
 * usando solo `done: boolean` (la evidencia es opcional).
 */
export interface ChecklistItemEvidence {
  /**
   * - `confirmed`: el responsable confirmó el ítem con evidencia.
   * - `pending`: pendiente de confirmación (default).
   * - `not_applicable`: no aplica (ej. CRL/OCSP cuando la CA no lo
   *   publica).
   */
  status: "pending" | "confirmed" | "not_applicable";
  /** Nota libre del responsable. */
  note?: string;
  /** Fecha ISO en que se confirmó (auto-set cuando status pasa a confirmed). */
  confirmedAt?: string;
  /** Nombre del responsable que confirmó (contador, admin, dueño). */
  responsible?: string;
  /** Referencia documental (URL, código de acta, archivo, etc.). */
  documentRef?: string;
}

export interface EnablementProgress {
  stepId: EnablementStepId;
  status: EnablementStatus;
  /** ISO timestamp del último cambio de estado. */
  updatedAt: string;
  /** Marcado como completado en el sistema (mock). */
  completedAt?: string;
  /** Usuario que marcó el cambio (mock). */
  completedBy?: string;
  /** Observaciones del usuario sobre este paso. */
  notes?: string;
  /** Razón del bloqueo si aplica. */
  blockerReason?: string;
  /**
   * Checklist interno: cada item con done + evidencia opcional.
   * `done` se mantiene por compat con steps que solo usan toggle.
   * Para `autorizacion_representante`, `done` se deriva de
   * `evidence.status === "confirmed" || "not_applicable"`.
   */
  checklist: {
    id: string;
    label: string;
    done: boolean;
    evidence?: ChecklistItemEvidence;
  }[];
  /**
   * Declaración final aceptada por el responsable. Aplica al paso
   * `autorizacion_representante`: el responsable declara que el
   * titular del cert está designado como Usuario Administrador e-CF
   * o representante autorizado. Sin esto, el paso no se considera
   * completado por el evaluador.
   */
  declarationAccepted?: boolean;
  /** ISO timestamp de la aceptación de la declaración. */
  declarationAcceptedAt?: string;
}

const STORAGE_KEY = "dermaland.dgii-enablement-progress";
const CHANGE_EVENT = "dermaland:dgii-enablement-changed";

function readLocal(): EnablementProgress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EnablementProgress[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: EnablementProgress[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function listProgress(): EnablementProgress[] {
  return readLocal();
}

export function getProgress(
  stepId: EnablementStepId,
): EnablementProgress | undefined {
  return readLocal().find((p) => p.stepId === stepId);
}

export function upsertProgress(record: EnablementProgress): void {
  const list = readLocal().filter((p) => p.stepId !== record.stepId);
  writeLocal([...list, { ...record, updatedAt: new Date().toISOString() }]);
}

export function setStepStatus(
  stepId: EnablementStepId,
  status: EnablementStatus,
  opts: { completedBy?: string; blockerReason?: string; notes?: string } = {},
): void {
  const list = readLocal();
  const idx = list.findIndex((p) => p.stepId === stepId);
  const now = new Date().toISOString();
  const base: EnablementProgress = list[idx] ?? {
    stepId,
    status,
    updatedAt: now,
    checklist: [],
  };
  const updated: EnablementProgress = {
    ...base,
    status,
    updatedAt: now,
    completedAt: status === "completed" ? now : base.completedAt,
    completedBy: opts.completedBy ?? base.completedBy,
    blockerReason:
      status === "blocked" ? (opts.blockerReason ?? base.blockerReason) : undefined,
    notes: opts.notes ?? base.notes,
  };
  if (idx === -1) writeLocal([...list, updated]);
  else {
    list[idx] = updated;
    writeLocal(list);
  }
}

export function toggleChecklistItem(
  stepId: EnablementStepId,
  itemId: string,
): void {
  const list = readLocal();
  const idx = list.findIndex((p) => p.stepId === stepId);
  if (idx === -1) return;
  const step = list[idx]!;
  const updated = {
    ...step,
    checklist: step.checklist.map((c) =>
      c.id === itemId ? { ...c, done: !c.done } : c,
    ),
    updatedAt: new Date().toISOString(),
  };
  list[idx] = updated;
  writeLocal(list);
}

/**
 * Actualiza la evidencia de un ítem del checklist. Si el ítem no
 * existe todavía (porque el paso recién se inicializa), lo agrega.
 * Sincroniza `done` con `evidence.status`: confirmed / not_applicable
 * → done; pending → not done.
 */
export function setChecklistItemEvidence(
  stepId: EnablementStepId,
  itemId: string,
  itemLabel: string,
  evidence: ChecklistItemEvidence,
): void {
  const list = readLocal();
  const idx = list.findIndex((p) => p.stepId === stepId);
  const now = new Date().toISOString();
  const computedDone =
    evidence.status === "confirmed" || evidence.status === "not_applicable";
  const evidenceWithDate: ChecklistItemEvidence =
    evidence.status === "confirmed" && !evidence.confirmedAt
      ? { ...evidence, confirmedAt: now }
      : evidence;

  if (idx === -1) {
    const fresh: EnablementProgress = {
      stepId,
      status: "in_progress",
      updatedAt: now,
      checklist: [
        { id: itemId, label: itemLabel, done: computedDone, evidence: evidenceWithDate },
      ],
    };
    writeLocal([...list, fresh]);
    return;
  }

  const step = list[idx]!;
  const itemIdx = step.checklist.findIndex((c) => c.id === itemId);
  const newChecklist = [...step.checklist];
  if (itemIdx === -1) {
    newChecklist.push({
      id: itemId,
      label: itemLabel,
      done: computedDone,
      evidence: evidenceWithDate,
    });
  } else {
    newChecklist[itemIdx] = {
      ...newChecklist[itemIdx]!,
      done: computedDone,
      evidence: evidenceWithDate,
    };
  }
  list[idx] = { ...step, checklist: newChecklist, updatedAt: now };
  writeLocal(list);
}

/**
 * Acepta o revoca la declaración final del responsable para un paso
 * (usado por `autorizacion_representante`). Sin esta declaración el
 * evaluador no marca el paso como completado aunque todos los items
 * estén confirmed.
 */
export function setDeclarationAccepted(
  stepId: EnablementStepId,
  accepted: boolean,
): void {
  const list = readLocal();
  const idx = list.findIndex((p) => p.stepId === stepId);
  const now = new Date().toISOString();
  if (idx === -1) {
    const fresh: EnablementProgress = {
      stepId,
      status: accepted ? "in_progress" : "pending",
      updatedAt: now,
      checklist: [],
      declarationAccepted: accepted,
      declarationAcceptedAt: accepted ? now : undefined,
    };
    writeLocal([...list, fresh]);
    return;
  }
  const step = list[idx]!;
  list[idx] = {
    ...step,
    declarationAccepted: accepted,
    declarationAcceptedAt: accepted ? now : undefined,
    updatedAt: now,
  };
  writeLocal(list);
}

export function resetEnablement(): void {
  writeLocal([]);
}

export function useEnablementProgress(): EnablementProgress[] {
  const [list, setList] = React.useState<EnablementProgress[]>([]);
  React.useEffect(() => {
    const refresh = () => setList(listProgress());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}

/** Computa % completado considerando solo pasos en `completed`. */
export function computeProgressPercent(
  total: number,
  list: EnablementProgress[],
): number {
  if (total === 0) return 0;
  const done = list.filter((p) => p.status === "completed").length;
  return Math.round((done / total) * 100);
}
