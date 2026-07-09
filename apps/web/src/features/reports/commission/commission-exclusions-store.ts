"use client";

// Store de EXCLUSIONES MANUALES de comisión (por número de comprobante).
//
// El Excel de referencia tenía 13 ventas excluidas a mano (decisiones del
// negocio, no derivables por fórmula). Esto permite marcar una venta concreta
// como "excluida de comisión" con un motivo. Fase 2: fuente ÚNICA en Supabase
// (`commission_exclusions`) vía `/api/commission/exclusions`; localStorage como
// fallback. Los helpers puros son testeables sin DOM y NO cambian.

import * as React from "react";
import { COMMISSION_BACKEND, apiGetList, apiSend } from "./commission-backend";

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

/** Notifica a los hooks que las exclusiones cambiaron. */
function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export type ExclusionResult = { ok: true } | { ok: false; error: string };

export async function saveExclusion(input: {
  comprobante: string;
  reason: string;
  userName?: string;
}): Promise<ExclusionResult> {
  const err = validateExclusion(input.comprobante, input.reason);
  if (err) return { ok: false, error: err };
  const payload = {
    comprobante: input.comprobante.trim(),
    reason: input.reason.trim(),
    userName: input.userName || "Administrador",
  };
  if (COMMISSION_BACKEND === "supabase") {
    const res = await apiSend("POST", "exclusions", payload);
    if (!res.ok) return { ok: false, error: res.error };
    notify();
    return { ok: true };
  }
  const entry: CommissionExclusion = { ...payload, createdAt: new Date().toISOString() };
  write(addExclusionIn(read(), entry));
  return { ok: true };
}

export async function deleteExclusion(comprobante: string): Promise<{ ok: boolean; error?: string }> {
  if (COMMISSION_BACKEND === "supabase") {
    const res = await apiSend("DELETE", `exclusions?comprobante=${encodeURIComponent(comprobante)}`);
    if (res.ok) notify();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  write(removeExclusionIn(read(), comprobante));
  return { ok: true };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCommissionExclusions(): CommissionExclusion[] {
  const [list, setList] = React.useState<CommissionExclusion[]>([]);
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (COMMISSION_BACKEND === "supabase") {
        apiGetList<CommissionExclusion>("exclusions", "exclusions")
          .then((d) => { if (alive) setList(d); })
          .catch(() => { if (alive) setList(read()); });
      } else {
        setList(read());
      }
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}
