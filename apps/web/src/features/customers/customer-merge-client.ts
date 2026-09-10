"use client";

import type { Customer } from "@/types";
import type { DuplicateConfidence } from "./utils/duplicate-detection";
import type { MergeImpact } from "@/server/services/customers/merge-clients";

export interface DuplicatePairDto {
  a: Customer;
  b: Customer;
  confidence: DuplicateConfidence;
  reasons: string[];
}

export type DuplicatePairsResult =
  | { ok: true; pairs: DuplicatePairDto[] }
  | { ok: false; error: string };

export async function fetchDuplicatePairs(): Promise<DuplicatePairsResult> {
  try {
    const res = await fetch("/api/customers/duplicates");
    const data = (await res.json().catch(() => ({}))) as { pairs?: DuplicatePairDto[]; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "No se pudo cargar la lista de duplicados." };
    return { ok: true, pairs: data.pairs ?? [] };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

export type MergeResult = { ok: true; moved: MergeImpact[] } | { ok: false; error: string };

async function postMerge(primaryId: string, duplicateId: string, dryRun: boolean): Promise<MergeResult> {
  try {
    const res = await fetch("/api/customers/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dryRun ? { primaryId, duplicateId, dryRun: true } : { primaryId, duplicateId }),
    });
    const data = (await res.json().catch(() => ({}))) as { moved?: MergeImpact[]; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "No se pudo completar la operación." };
    return { ok: true, moved: data.moved ?? [] };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

export const mergeCustomersDryRun = (primaryId: string, duplicateId: string) =>
  postMerge(primaryId, duplicateId, true);

export const mergeCustomers = (primaryId: string, duplicateId: string) =>
  postMerge(primaryId, duplicateId, false);

const IMPACT_LABELS: Record<string, string> = {
  alegra_invoices: "facturas migradas",
  ar_promises: "promesas de pago",
  client_auth_links: "vínculos de acceso a la tienda",
  electronic_invoices: "comprobantes electrónicos",
  electronic_invoices_legacy_20260906: "comprobantes electrónicos (histórico)",
  proformas: "ventas del sistema",
  web_orders: "pedido web",
};

/** "14 facturas migradas, 3 promesas de pago, 1 pedido web" — solo lo que de verdad se mueve. */
export function describeMergeImpact(moved: MergeImpact[]): string {
  const partes = moved
    .filter((m) => m.count > 0)
    .map((m) => `${m.count} ${IMPACT_LABELS[m.table] ?? m.table}`);
  return partes.length > 0 ? partes.join(", ") : "Sin historial que mover.";
}
