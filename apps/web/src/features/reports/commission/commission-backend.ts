"use client";

/**
 * Fuente de datos de los stores de comisión (Fase 2).
 *
 *  - "local"    → localStorage (modo demo, por equipo).
 *  - "supabase" → fuente ÚNICA compartida vía `/api/commission/*` (RLS por
 *                 business_id). Se activa con `NEXT_PUBLIC_DATA_SOURCE=supabase`.
 *
 * Mismo interruptor que `PRODUCT_BACKEND` / `CATALOG_BACKEND`. Cuando la API
 * falla, los hooks caen al último dato bueno o al localStorage (fallback), así
 * que el reporte nunca queda en blanco.
 */
export const COMMISSION_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

/**
 * Nombres de los eventos que cada store despacha al mutar (fuente única, para
 * que un cambio que afecta a varios stores — p. ej. crear un lote toca lotes,
 * pagos y auditoría — pueda refrescar a todos sin acoplarlos).
 */
export const COMMISSION_EVENTS = {
  rules: "dermaland:commission-rules-changed",
  exclusions: "dermaland:commission-exclusions-changed",
  payouts: "dermaland:commission-payouts-changed",
  batches: "dermaland:commission-batches-changed",
  audit: "dermaland:commission-audit-changed",
} as const;

/** Despacha uno o varios eventos de cambio para que sus hooks se refresquen. */
export function dispatchCommission(...events: string[]): void {
  if (typeof window === "undefined") return;
  for (const name of events) window.dispatchEvent(new CustomEvent(name));
}

/** GET de una lista del API de comisión: `/api/commission/<path>` → `json[key]`. */
export async function apiGetList<T>(path: string, key: string): Promise<T[]> {
  const res = await fetch(`/api/commission/${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  return (json[key] as T[]) ?? [];
}

export type ApiSendResult<T> = { ok: true; item?: T } | { ok: false; error: string };

/**
 * Escritura al API de comisión. Nunca lanza — devuelve `{ ok:false, error }`
 * para que los callers "fire-and-forget" no generen unhandled rejections.
 */
export async function apiSend<T = unknown>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  key?: string,
): Promise<ApiSendResult<T>> {
  try {
    const res = await fetch(`/api/commission/${path}`, {
      method,
      headers: body == null ? undefined : { "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: (json.error as string) ?? `HTTP ${res.status}` };
    return { ok: true, item: key ? (json[key] as T) : undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
