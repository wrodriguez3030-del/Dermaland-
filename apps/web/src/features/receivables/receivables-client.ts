"use client";

import type { ArSettings, ArSummary, ClientStatement, CollectionHistoryRow, PromiseRow, ReceivableRow } from "@/server/services/receivables/service";

/**
 * Cliente HTTP del módulo Cuentas por Cobrar. Tipos re-usados del servicio
 * server (solo tipos → no arrastra código server al bundle).
 */

export type { ArSettings, ArSummary, ClientStatement, CollectionHistoryRow, PromiseRow, ReceivableRow };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json?.error ?? "La operación no se pudo completar.");
  return json;
}

export const arApi = {
  pending: () => call<{ rows: ReceivableRow[] }>("/api/receivables").then((r) => r.rows),
  summary: () => call<{ summary: ArSummary }>("/api/receivables/summary").then((r) => r.summary),
  history: () => call<{ rows: CollectionHistoryRow[] }>("/api/receivables/history").then((r) => r.rows),
  statement: (clientId: string) =>
    call<{ statement: ClientStatement }>(`/api/receivables/statement/${clientId}`).then((r) => r.statement),
  collect: (input: {
    items: { proformaId: string; amount: number }[];
    method: string;
    reference?: string;
    bank?: string;
    comments?: string;
  }) => call<{ result: { applied: unknown[]; totalApplied: number } }>("/api/receivables/collect", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => r.result),
  promises: () => call<{ promises: PromiseRow[] }>("/api/receivables/promises").then((r) => r.promises),
  createPromise: (input: {
    clientId?: string | null;
    clientName: string;
    proformaId?: string | null;
    promisedDate: string;
    amount: number;
    notes?: string;
  }) => call<{ promise: PromiseRow }>("/api/receivables/promises", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => r.promise),
  updatePromise: (id: string, status: "pending" | "kept" | "broken") =>
    call<{ promise: PromiseRow }>(`/api/receivables/promises/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).then((r) => r.promise),
  settings: () => call<{ settings: ArSettings }>("/api/receivables/settings").then((r) => r.settings),
  saveSettings: (s: ArSettings) =>
    call<{ settings: ArSettings }>("/api/receivables/settings", {
      method: "PUT",
      body: JSON.stringify(s),
    }).then((r) => r.settings),
  updateCredit: (clientId: string, input: { creditLimit: number | null; creditDays: number | null; creditBlocked: boolean }) =>
    call<{ customer: unknown }>(`/api/receivables/credit/${clientId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
};

/** Formato RD$ compartido por las pantallas del módulo. */
export function money(n: number): string {
  return `RD$${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** dd/mm/aaaa para fechas YYYY-MM-DD o ISO. */
export function fecha(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}
