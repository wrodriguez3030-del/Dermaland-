"use client";

import * as React from "react";
import type { Payment, Proforma, SaleItem } from "@/types";
import { mockProformas } from "@/lib/mock-data/sales";
import { reserveNext } from "@/features/dgii/numbering-store";
import { documentEditability } from "@/features/sales/editability";
import { recalcInvoice, lineFromSaleItem } from "@/features/sales/invoice-edit";

/**
 * Store de proformas — MVP con gate Supabase.
 *
 * Combina las proformas seed (`mockProformas`) con las emitidas desde el POS,
 * persistidas en `localStorage` bajo la key `dermaland.proformas`.
 *
 * En modo `supabase` (`NEXT_PUBLIC_DATA_SOURCE=supabase`) los hooks y wrappers
 * usan la API `/api/proformas` como fuente única compartida (RLS business_id).
 * En modo local (`mock` / default) el comportamiento es idéntico al original:
 * localStorage + seed, sin llamadas al servidor.
 *
 * NO fiscal/e-CF: `convertToEcf` queda como está (gated/demo, Fase G).
 */

// ─── Gate ────────────────────────────────────────────────────────────────────

/**
 * Backend activo para proformas:
 * - "local"    → localStorage + seed (demo, por equipo).
 * - "supabase" → fuente única compartida vía /api/proformas (RLS business_id).
 *
 * Se activa con `NEXT_PUBLIC_DATA_SOURCE=supabase` (build) + `DATA_SOURCE=
 * supabase` (servidor) + credenciales Supabase válidas. Por defecto: local.
 */
export const PROFORMA_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

// ─── Local persistence ───────────────────────────────────────────────────────

const STORAGE_KEY = "dermaland.proformas";
const CHANGE_EVENT = "dermaland:proformas-changed";

function readLocal(): Proforma[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Proforma[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: Proforma[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

// ─── Local (mock/demo) helpers ───────────────────────────────────────────────

export function listAllProformas(): Proforma[] {
  // Las locales arriba (más recientes), después los seeds.
  const local = readLocal().sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  return [...local, ...mockProformas];
}

export function getProformaByIdFromStore(id: string): Proforma | undefined {
  return listAllProformas().find((p) => p.id === id);
}

export function addProforma(proforma: Proforma): void {
  const list = readLocal();
  writeLocal([proforma, ...list]);
}

export function clearLocalProformas(): void {
  writeLocal([]);
}

export function generateProformaNumber(): string {
  // Usa la numeración PROF configurada (ambiente mock) si está disponible;
  // así el número respeta el rango/secuencia administrado en DGII > Numeraciones.
  try {
    const r = reserveNext("proforma", "mock");
    if (r.ok) return r.formatted;
  } catch {
    /* sin numeración configurada → fallback */
  }
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Date.now() / 1000) % 100000).padStart(5, "0");
  return `PROF-${year}-${seq}`;
}

export function generateProformaId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `prof_${ts}_${rand}`;
}

// ─── Server fetch helpers (Supabase mode) ───────────────────────────────────

/**
 * Lee la lista de proformas desde el servidor (Supabase).
 * Úsalo cuando `PROFORMA_BACKEND === "supabase"`.
 */
export async function fetchProformasFromServer(): Promise<Proforma[]> {
  const res = await fetch("/api/proformas", { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { proformas: Proforma[] }).proformas;
}

/**
 * Lee una proforma individual desde el servidor (Supabase).
 */
export async function fetchProformaFromServer(id: string): Promise<Proforma | null> {
  const res = await fetch(`/api/proformas/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { proforma: Proforma }).proforma;
}

// ─── Mutation wrappers ───────────────────────────────────────────────────────

export type CreateProformaResult =
  | { ok: true; proforma: Proforma }
  | { ok: false; error: string };

/**
 * Crea una proforma — local o Supabase según el gate.
 *
 * En modo supabase envía POST /api/proformas y notifica cambio para refetch.
 * En modo local persiste en localStorage (comportamiento original).
 *
 * Descuento de stock: en modo local el POS ya descuenta stock vía adjustStock
 * del lot-store localmente; en modo supabase queda pendiente (ver reporte).
 */
export async function createProformaAnywhere(
  proforma: Proforma,
): Promise<CreateProformaResult> {
  if (PROFORMA_BACKEND === "supabase") {
    try {
      // Excluir id/createdAt/updatedAt del body — el servidor los genera.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...input } = proforma;
      const res = await fetch("/api/proformas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => ({}))) as {
        proforma?: Proforma;
        error?: string;
      };
      if (!res.ok || !body.proforma) {
        return {
          ok: false,
          error: body.error ?? "No se pudo registrar la venta. Intenta nuevamente.",
        };
      }
      notifyChanged();
      return { ok: true, proforma: body.proforma };
    } catch {
      // Error de red/conexión (nunca técnico de Supabase).
      return {
        ok: false,
        error: "No se pudo conectar con el servidor. Intenta nuevamente.",
      };
    }
  }
  // Modo local
  addProforma(proforma);
  return { ok: true, proforma };
}

export type CancelProformaResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Cancela una proforma — local o Supabase según el gate.
 *
 * En modo supabase envía PATCH /api/proformas/[id] con action: "cancel".
 * En modo local actualiza el status en localStorage.
 */
export async function cancelProformaAnywhere(
  id: string,
  reason: string,
): Promise<CancelProformaResult> {
  if (PROFORMA_BACKEND === "supabase") {
    try {
      const res = await fetch(`/api/proformas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      notifyChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  // Modo local: actualizar en localStorage
  // C6: devolver error si el id no existe en lugar de ok silencioso.
  const list = readLocal();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) {
    return { ok: false, error: "Proforma no encontrada." };
  }
  list[idx] = { ...list[idx]!, status: "cancelled", notes: reason };
  writeLocal(list);
  return { ok: true };
}

export type UpdateProformaResult =
  | { ok: true; proforma: Proforma }
  | { ok: false; error: string };

/**
 * Edita datos NO fiscales de una proforma/factura (cliente del documento,
 * notas) — local o Supabase según el gate.
 *
 * En supabase envía PATCH /api/proformas/[id] con action:"update" (permiso +
 * editabilidad + auditoría se validan en el servidor). En local aplica el
 * patch en localStorage. NUNCA toca número/ncf/ecf/montos/ítems.
 */
export async function updateProformaAnywhere(
  id: string,
  patch: {
    customerName?: string;
    customerPhone?: string | null;
    customerDocument?: string | null;
    notes?: string | null;
  },
): Promise<UpdateProformaResult> {
  if (PROFORMA_BACKEND === "supabase") {
    try {
      const res = await fetch(`/api/proformas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", patch }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        proforma?: Proforma;
        error?: string;
      };
      if (!res.ok || !body.proforma) {
        return { ok: false, error: body.error ?? "No se pudo guardar el cambio." };
      }
      notifyChanged();
      return { ok: true, proforma: body.proforma };
    } catch {
      return { ok: false, error: "No se pudo conectar con el servidor. Intenta nuevamente." };
    }
  }
  // Modo local
  const list = readLocal();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) {
    return { ok: false, error: "Documento no encontrado." };
  }
  // Defensa en profundidad: no editar e-CF / anulados / emitidos ni en local.
  const editability = documentEditability(list[idx]!);
  if (!editability.editable) {
    return { ok: false, error: editability.reason ?? "Este documento no se puede editar." };
  }
  const next: Proforma = {
    ...list[idx]!,
    ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
    ...(patch.customerPhone !== undefined ? { customerPhone: patch.customerPhone ?? undefined } : {}),
    ...(patch.customerDocument !== undefined
      ? { customerDocument: patch.customerDocument ?? undefined }
      : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes ?? undefined } : {}),
    updatedAt: new Date().toISOString(),
  };
  list[idx] = next;
  writeLocal(list);
  return { ok: true, proforma: next };
}

/** Patch de edición COMPLETA (ítems, cantidades, precios, descuentos, pagos). */
export interface FullInvoicePatch {
  customerName?: string;
  customerPhone?: string | null;
  customerDocument?: string | null;
  notes?: string | null;
  items: SaleItem[];
  payments: Payment[];
  discountPercent?: number;
  cashierName?: string;
  status?: Proforma["status"];
  emittedAt?: string;
  billingType?: Proforma["billingType"];
}

/**
 * Edición COMPLETA de una factura/proforma (ítems, cantidades, precios,
 * descuentos, pagos) — local o Supabase según el gate.
 *
 * El SERVIDOR recalcula los totales desde los ítems y reemplaza líneas/pagos;
 * NUNCA cambia número, NCF/e-CF ni el tipo de documento. El ajuste de stock lo
 * hace el llamador (cliente) por DELTA, igual que el POS. Cambios sensibles
 * exigen `reason` (validado también en el servidor).
 */
export async function updateProformaFullAnywhere(
  id: string,
  patch: FullInvoicePatch,
  reason: string,
): Promise<UpdateProformaResult> {
  if (PROFORMA_BACKEND === "supabase") {
    try {
      const res = await fetch(`/api/proformas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_full", patch, reason }),
      });
      const bodyRes = (await res.json().catch(() => ({}))) as {
        proforma?: Proforma;
        error?: string;
      };
      if (!res.ok || !bodyRes.proforma) {
        return { ok: false, error: bodyRes.error ?? "No se pudo guardar la factura." };
      }
      notifyChanged();
      return { ok: true, proforma: bodyRes.proforma };
    } catch {
      return { ok: false, error: "No se pudo conectar con el servidor. Intenta nuevamente." };
    }
  }
  // Modo local: recomputar y persistir en localStorage.
  const list = readLocal();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) {
    return { ok: false, error: "Documento no encontrado." };
  }
  const current = list[idx]!;
  const editability = documentEditability(current);
  if (!editability.editable) {
    return { ok: false, error: editability.reason ?? "Este documento no se puede editar." };
  }
  const recomputed = recalcInvoice({
    customerName: patch.customerName ?? current.customerName,
    customerPhone: patch.customerPhone ?? null,
    customerDocument: patch.customerDocument ?? null,
    notes: patch.notes ?? null,
    items: patch.items.map(lineFromSaleItem),
    globalDiscountPercent: patch.discountPercent ?? 0,
    payments: patch.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      last4: p.last4,
    })),
  });
  const next: Proforma = {
    ...current,
    ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
    ...(patch.customerPhone !== undefined ? { customerPhone: patch.customerPhone ?? undefined } : {}),
    ...(patch.customerDocument !== undefined
      ? { customerDocument: patch.customerDocument ?? undefined }
      : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes ?? undefined } : {}),
    items: recomputed.items,
    payments: patch.payments.map((p) => ({ ...p, proformaId: id })),
    subtotal: recomputed.subtotal,
    discount: recomputed.discount,
    itbis: recomputed.itbis,
    total: recomputed.total,
    discountPercent: recomputed.discountPercent,
    paid: recomputed.paid,
    balance: recomputed.balance,
    ...(patch.cashierName !== undefined ? { cashierName: patch.cashierName } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.emittedAt ? { createdAt: patch.emittedAt } : {}),
    ...(patch.billingType !== undefined ? { billingType: patch.billingType } : {}),
    updatedAt: new Date().toISOString(),
  };
  list[idx] = next;
  writeLocal(list);
  return { ok: true, proforma: next };
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Hook reactivo: devuelve la lista de proformas.
 *
 * En modo supabase fetcha desde /api/proformas y se re-renderiza al cambiar.
 * En modo local usa el store local (localStorage + seed) con el patrón
 * de SSR-safe hydration original (sin "Hydration failed").
 */
export function useProformas(): Proforma[] {
  const [list, setList] = React.useState<Proforma[]>(
    PROFORMA_BACKEND === "supabase" ? [] : mockProformas,
  );

  const loadFromServer = React.useCallback(() => {
    fetchProformasFromServer()
      .then((data) => setList(data))
      .catch(() => {
        // Fallback a local para no romper la UI
        setList(listAllProformas());
      });
  }, []);

  React.useEffect(() => {
    if (PROFORMA_BACKEND === "supabase") {
      loadFromServer();
      const handleChange = () => loadFromServer();
      window.addEventListener(CHANGE_EVENT, handleChange);
      return () => window.removeEventListener(CHANGE_EVENT, handleChange);
    } else {
      // Modo local: hidratación SSR-safe (misma lógica original)
      const refresh = () => setList(listAllProformas());
      window.addEventListener(CHANGE_EVENT, refresh);
      window.addEventListener("storage", refresh);
      refresh();
      return () => {
        window.removeEventListener(CHANGE_EVENT, refresh);
        window.removeEventListener("storage", refresh);
      };
    }
  }, [loadFromServer]);

  return list;
}

/**
 * Hook reactivo: devuelve una proforma por ID con estado de carga.
 *
 * En modo supabase fetcha desde /api/proformas/[id].
 * En modo local busca en el store local.
 */
export function useProforma(id: string | null | undefined): Proforma | undefined {
  const list = useProformas();
  if (!id) return undefined;
  return list.find((p) => p.id === id);
}

export interface ProformaDocState {
  proforma: Proforma | undefined;
  loading: boolean;
}

/**
 * Carga UN documento por id desde la fuente correcta:
 *  - modo supabase  → `GET /api/proformas/:id` (NUNCA localStorage).
 *  - modo local     → store en localStorage.
 *
 * Expone `loading` para que las páginas de ver/imprimir muestren "Cargando…"
 * en vez de un "no encontrado" prematuro. Reactivo a cambios del store.
 */
export function useProformaDocument(
  id: string | null | undefined,
): ProformaDocState {
  const [state, setState] = React.useState<ProformaDocState>({
    proforma: undefined,
    loading: Boolean(id),
  });

  React.useEffect(() => {
    if (!id) {
      setState({ proforma: undefined, loading: false });
      return;
    }
    let alive = true;

    const load = () => {
      if (PROFORMA_BACKEND === "supabase") {
        // Fuente única: servidor. Nunca caemos a localStorage en producción.
        fetchProformaFromServer(id)
          .then((p) => {
            if (alive) setState({ proforma: p ?? undefined, loading: false });
          })
          .catch(() => {
            // Error de red/sesión → no encontrado (mensaje amigable en la UI).
            if (alive) setState({ proforma: undefined, loading: false });
          });
      } else {
        setState({ proforma: getProformaByIdFromStore(id), loading: false });
      }
    };

    load();
    if (typeof window !== "undefined") {
      window.addEventListener(CHANGE_EVENT, load);
      window.addEventListener("storage", load);
    }
    return () => {
      alive = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(CHANGE_EVENT, load);
        window.removeEventListener("storage", load);
      }
    };
  }, [id]);

  return state;
}
