"use client";

// Estado de PAGO de comisiones (por número de comprobante).
//
// El motor lee un `Map<comprobante, PayoutStatus>`; por defecto todo es
// "pending", y aquí se guardan solo las que pasan a "approved" o "paid".
// Fase 2: fuente ÚNICA en Supabase (`commission_payouts`) vía
// `/api/commission/payouts`; localStorage como fallback. Helpers puros
// testeables sin DOM y sin cambios.

import * as React from "react";
import type { PayoutStatus } from "./commission-engine";
import { COMMISSION_BACKEND, apiGetList, apiSend } from "./commission-backend";

/** Estados que gestiona este store (subconjunto de PayoutStatus). */
export type ManagedPayout = "approved" | "paid";

export interface PayoutRecord {
  comprobante: string;
  status: ManagedPayout;
  userName: string;
  at: string;
  /** Lote de pago que lo marcó pagado (si aplica). */
  batchId?: string;
}

const KEY = "dermaland.commission-payouts";
const CHANGE_EVENT = "dermaland:commission-payouts-changed";

// ─── Lógica PURA ─────────────────────────────────────────────────────────────

export function setPayoutIn(
  list: PayoutRecord[],
  comprobantes: string[],
  status: ManagedPayout,
  userName: string,
  at: string,
  batchId?: string,
): PayoutRecord[] {
  const set = new Set(comprobantes);
  const kept = list.filter((r) => !set.has(r.comprobante));
  const next = comprobantes.map((comprobante) => ({ comprobante, status, userName, at, batchId }));
  return [...next, ...kept];
}

export function clearPayoutIn(list: PayoutRecord[], comprobantes: string[]): PayoutRecord[] {
  const set = new Set(comprobantes);
  return list.filter((r) => !set.has(r.comprobante));
}

/** Mapa para el motor: comprobante → estado de pago. */
export function payoutMap(list: PayoutRecord[]): Map<string, PayoutStatus> {
  return new Map(list.map((r) => [r.comprobante, r.status as PayoutStatus]));
}

// ─── Persistencia ────────────────────────────────────────────────────────────

function read(): PayoutRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PayoutRecord[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function write(list: PayoutRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function listPayouts(): PayoutRecord[] {
  return read();
}

/** Notifica a los hooks que el estado de pago cambió. */
function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export async function setPayout(
  comprobantes: string[],
  status: ManagedPayout,
  opts: { userName?: string; batchId?: string } = {},
): Promise<{ ok: boolean; error?: string }> {
  if (COMMISSION_BACKEND === "supabase") {
    const res = await apiSend("POST", "payouts", {
      comprobantes,
      status,
      userName: opts.userName,
      batchId: opts.batchId,
    });
    if (res.ok) notify();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  write(
    setPayoutIn(read(), comprobantes, status, opts.userName || "Administrador", new Date().toISOString(), opts.batchId),
  );
  return { ok: true };
}

export async function clearPayout(comprobantes: string[]): Promise<{ ok: boolean; error?: string }> {
  if (COMMISSION_BACKEND === "supabase") {
    const res = await apiSend("DELETE", "payouts", { comprobantes });
    if (res.ok) notify();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  write(clearPayoutIn(read(), comprobantes));
  return { ok: true };
}

export function usePayouts(): Map<string, PayoutStatus> {
  const [map, setMap] = React.useState<Map<string, PayoutStatus>>(new Map());
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (COMMISSION_BACKEND === "supabase") {
        apiGetList<PayoutRecord>("payouts", "payouts")
          .then((list) => { if (alive) setMap(payoutMap(list)); })
          .catch(() => { if (alive) setMap(payoutMap(read())); });
      } else {
        setMap(payoutMap(read()));
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
  return map;
}
