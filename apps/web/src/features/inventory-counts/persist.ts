/**
 * Persistencia del conteo físico a Supabase AL FINALIZAR (modelo "crear al
 * enviar"): durante el conteo la sesión vive offline en el cliente
 * (scan-session-store); al aprobar/cerrar se persiste la cabecera + ítems vía
 * `POST /api/inventory-counts` (Fase 2a).
 *
 * `buildCountCreatePayload` es PURO y testeable. `persistCountToSupabase` es
 * best-effort: si el backend está en modo mock (409) o hay red intermitente, el
 * flujo local NO se rompe — la sesión sigue aprobada en el dispositivo.
 */
import type { CountSession } from "./scan-session-store";

export type FinalCountStatus =
  | "submitted"
  | "reviewed"
  | "approved"
  | "adjusted"
  | "rejected";

export interface CountItemPayload {
  productId: string;
  productSku: string;
  productName: string;
  expectedQuantity: number;
  countedQuantity: number;
  differenceQuantity: number;
  status: "match" | "shortage" | "overage";
  lastScanAt?: string;
}

export interface CountCreatePayload {
  countNumber: string;
  branchId: string;
  countType: CountSession["type"];
  status: FinalCountStatus;
  notes?: string;
  startedAt?: string;
  items: CountItemPayload[];
}

/** Arma el body de `POST /api/inventory-counts` desde una sesión de conteo. */
export function buildCountCreatePayload(
  session: CountSession,
  systemQuantityFor: (productId: string) => number,
  status: FinalCountStatus,
): CountCreatePayload {
  return {
    countNumber: session.code,
    branchId: session.branchId,
    countType: session.type,
    status,
    notes: session.notes,
    startedAt: session.startedAt,
    items: session.items.map((it) => {
      const expected = systemQuantityFor(it.productId);
      const diff = it.countedQuantity - expected;
      return {
        productId: it.productId,
        productSku: it.sku,
        productName: it.productName,
        expectedQuantity: expected,
        countedQuantity: it.countedQuantity,
        differenceQuantity: diff,
        status: diff === 0 ? "match" : diff < 0 ? "shortage" : "overage",
        lastScanAt: it.lastScannedAt,
      };
    }),
  };
}

export interface PersistResult {
  ok: boolean;
  id?: string;
  /** "mock" = backend en modo local (409); "network"/"error" = fallo real. */
  reason?: "mock" | "network" | "error";
  message?: string;
}

/** POST best-effort. Nunca lanza: devuelve el resultado para decidir el toast. */
export async function persistCountToSupabase(
  payload: CountCreatePayload,
): Promise<PersistResult> {
  try {
    const res = await fetch("/api/inventory-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 409) return { ok: false, reason: "mock" };
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* respuesta sin body */
    }
    if (!res.ok) {
      const message =
        (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
      return { ok: false, reason: "error", message };
    }
    const id = (data as { count?: { id?: string } } | null)?.count?.id;
    return { ok: true, id };
  } catch {
    return { ok: false, reason: "network" };
  }
}
