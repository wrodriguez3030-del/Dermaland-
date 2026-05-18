"use client";

import * as React from "react";

/**
 * Store de cierres de caja — MVP mock.
 *
 * Persiste los registros de cierre en `localStorage` bajo
 * `dermaland.cash-closings`. Cada cierre incluye los IDs de proformas
 * que se seleccionaron para conversión a e-CF (demo), el porcentaje
 * aplicado, montos objetivo vs real y comentario (cuando aplique).
 *
 * Producción: reemplazar por tabla `cash_closings` +
 * `cash_closing_sales` + `cash_closing_percentage_logs` (migración 0003).
 */

export interface CashClosingRecord {
  id: string;
  closingNumber: string;
  sessionId?: string;
  cashierId: string;
  cashierName: string;
  closedAt: string;
  totals: {
    cash: number;
    transfer: number;
    card: number;
    other: number;
    general: number;
  };
  proformasPending: {
    totalAmount: number;
    count: number;
  };
  appliedPercentage: number;
  targetAmount: number;
  actualAmount: number;
  selectedProformaIds: string[];
  unselectedProformaIds: string[];
  comment?: string;
  /** Marca que esto es mock — el cierre no fue persistido en DB ni se enviaron e-CFs reales. */
  isMock: true;
}

const STORAGE_KEY = "dermaland.cash-closings";
const CHANGE_EVENT = "dermaland:cash-closings-changed";

function readLocal(): CashClosingRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CashClosingRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: CashClosingRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function listCashClosings(): CashClosingRecord[] {
  return readLocal().sort(
    (a, b) => +new Date(b.closedAt) - +new Date(a.closedAt),
  );
}

export function getCashClosingById(
  id: string,
): CashClosingRecord | undefined {
  return readLocal().find((c) => c.id === id);
}

export function addCashClosing(record: CashClosingRecord): void {
  const list = readLocal();
  writeLocal([record, ...list]);
}

export function generateCashClosingId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `cc_${ts}_${rand}`;
}

export function generateCashClosingNumber(): string {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Date.now() / 1000) % 100000).padStart(5, "0");
  return `CC-${year}-${seq}`;
}

export function useCashClosings(): CashClosingRecord[] {
  const [list, setList] = React.useState<CashClosingRecord[]>([]);
  React.useEffect(() => {
    const refresh = () => setList(listCashClosings());
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

export function useCashClosing(
  id: string | null | undefined,
): CashClosingRecord | undefined {
  const list = useCashClosings();
  if (!id) return undefined;
  return list.find((c) => c.id === id);
}
