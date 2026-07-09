"use client";

// Store de EXCLUSIONES MANUALES de comisión (por número de comprobante).
//
// El Excel de referencia tenía 13 ventas excluidas a mano (decisiones del
// negocio, no derivables por fórmula). Esto permite marcar una venta concreta
// como "excluida de comisión" con un motivo, sin migración de DB. Persistencia
// en localStorage (patrón `commission-rules-store`); API estable para migrar a
// `commission_exclusions` (Fase 2). Helpers puros testeables sin DOM.

import * as React from "react";

export interface CommissionExclusion {
  /** Número de comprobante (NCF/e-NCF) — clave única. */
  comprobante: string;
  reason: string;
  userName: string;
  createdAt: string;
}

const KEY = "dermaland.commission-exclusions";
const CHANGE_EVENT = "dermaland:commission-exclusions-changed";

// ─── Lógica PURA (testeable) ─────────────────────────────────────────────────

export function validateExclusion(comprobante: string, reason: string): string | null {
  if (!comprobante?.trim()) return "Falta el número de comprobante.";
  if (!reason?.trim()) return "Indica el motivo de la exclusión.";
  return null;
}

/** Agrega o actualiza una exclusión por comprobante (puro). */
export function addExclusionIn(
  list: CommissionExclusion[],
  entry: CommissionExclusion,
): CommissionExclusion[] {
  const rest = list.filter((e) => e.comprobante !== entry.comprobante);
  return [entry, ...rest];
}

export function removeExclusionIn(
  list: CommissionExclusion[],
  comprobante: string,
): CommissionExclusion[] {
  return list.filter((e) => e.comprobante !== comprobante);
}

export function isExcludedIn(list: CommissionExclusion[], comprobante: string): boolean {
  return list.some((e) => e.comprobante === comprobante);
}

/** Solo los números de comprobante (lo que consume el motor). */
export function excludedComprobantes(list: CommissionExclusion[]): string[] {
  return list.map((e) => e.comprobante);
}

/** Mapa comprobante→motivo (para mostrar el motivo en la tabla). */
export function exclusionReasonMap(list: CommissionExclusion[]): Map<string, string> {
  return new Map(list.map((e) => [e.comprobante, e.reason]));
}

// ─── Persistencia (localStorage) ─────────────────────────────────────────────

function read(): CommissionExclusion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CommissionExclusion[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: CommissionExclusion[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function listCommissionExclusions(): CommissionExclusion[] {
  return read();
}

export type ExclusionResult = { ok: true } | { ok: false; error: string };

export function saveExclusion(input: {
  comprobante: string;
  reason: string;
  userName?: string;
}): ExclusionResult {
  const err = validateExclusion(input.comprobante, input.reason);
  if (err) return { ok: false, error: err };
  const entry: CommissionExclusion = {
    comprobante: input.comprobante.trim(),
    reason: input.reason.trim(),
    userName: input.userName || "Administrador",
    createdAt: new Date().toISOString(),
  };
  write(addExclusionIn(read(), entry));
  return { ok: true };
}

export function deleteExclusion(comprobante: string): { ok: boolean } {
  write(removeExclusionIn(read(), comprobante));
  return { ok: true };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCommissionExclusions(): CommissionExclusion[] {
  const [list, setList] = React.useState<CommissionExclusion[]>([]);
  React.useEffect(() => {
    const refresh = () => setList(read());
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
