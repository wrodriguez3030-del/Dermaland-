"use client";

/**
 * Store de LECTURA/transición del inventario físico (conteo físico).
 *
 * B-05a (Fase 2b): las páginas leen los conteos reales desde la API de Supabase
 * (`/api/inventory-counts`) con **fallback a mock**. La API responde 409 cuando
 * `DATA_SOURCE=mock` (señal documentada, igual que `persist.ts`): en ese caso —o
 * ante un error de red— caemos a los datos de demostración. `source` permite a la
 * UI avisar "datos de demostración".
 *
 * Las transiciones (submit/approve/reject) van por `POST /api/inventory-counts/[id]`.
 * `approve` dispara el ajuste ATÓMICO de stock en el servidor (RPC
 * `apply_count_adjustments`, B-05b).
 */
import { useCallback, useEffect, useState } from "react";
import type { InventoryCount, InventoryCountItem, InventoryCountScan } from "@/types";
import {
  mockInventoryCounts,
  mockCountItems,
  getInventoryCountById,
  getItemsForCount,
  getScansForCount,
} from "@/lib/mock-data/inventory-counts";

export type CountsSource = "supabase" | "mock";

const CHANGE_EVENT = "dermaland:counts-changed";
function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Sentinela: la API respondió 409 (backend en modo mock) → usar demo. */
const MOCK_409 = Symbol("mock-409");

async function fetchCountsFromServer(): Promise<InventoryCount[] | typeof MOCK_409> {
  const res = await fetch("/api/inventory-counts", { cache: "no-store" });
  if (res.status === 409) return MOCK_409;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { counts?: InventoryCount[] };
  return body.counts ?? [];
}

type CountDetail = { count: InventoryCount; items: InventoryCountItem[]; scans: InventoryCountScan[] };

async function fetchCountDetailFromServer(
  id: string,
): Promise<CountDetail | typeof MOCK_409 | null> {
  const res = await fetch(`/api/inventory-counts/${id}`, { cache: "no-store" });
  if (res.status === 409) return MOCK_409;
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CountDetail;
}

export type TransitionResult = { ok: true } | { ok: false; error: string };

async function transition(
  id: string,
  action: "submit" | "approve" | "reject",
  reason?: string,
): Promise<TransitionResult> {
  try {
    const res = await fetch(`/api/inventory-counts/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    if (res.status === 409) {
      return { ok: false, error: "El backend de conteos está en modo local (demo)." };
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    notifyChanged();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const submitCount = (id: string) => transition(id, "submit");
export const approveCount = (id: string) => transition(id, "approve");
export const rejectCount = (id: string, reason: string) => transition(id, "reject", reason);

/** Lista de conteos reales (fallback a demo). */
export function useCounts(): { counts: InventoryCount[]; loading: boolean; source: CountsSource } {
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<CountsSource>("supabase");

  const refresh = useCallback(() => {
    let alive = true;
    fetchCountsFromServer()
      .then((r) => {
        if (!alive) return;
        if (r === MOCK_409) {
          setCounts(mockInventoryCounts);
          setSource("mock");
        } else {
          setCounts(r);
          setSource("supabase");
        }
      })
      .catch(() => {
        if (!alive) return;
        // Red caída → demo, no romper la pantalla.
        setCounts(mockInventoryCounts);
        setSource("mock");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const cleanup = refresh();
    const onChange = () => refresh();
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      cleanup?.();
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [refresh]);

  return { counts, loading, source };
}

/** Detalle de un conteo real (cabecera + ítems + escaneos), fallback a demo. */
export function useCount(id: string | null | undefined): {
  count: InventoryCount | null;
  items: InventoryCountItem[];
  scans: InventoryCountScan[];
  loading: boolean;
  source: CountsSource;
  notFound: boolean;
} {
  const [state, setState] = useState<{
    count: InventoryCount | null;
    items: InventoryCountItem[];
    scans: InventoryCountScan[];
    source: CountsSource;
    notFound: boolean;
  }>({ count: null, items: [], scans: [], source: "supabase", notFound: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!id) {
      setState((s) => ({ ...s, count: null, notFound: true }));
      setLoading(false);
      return () => {};
    }
    let alive = true;
    const fallbackToMock = () => {
      const count = getInventoryCountById(id) ?? null;
      setState({
        count,
        items: count ? getItemsForCount(id) : [],
        scans: count ? getScansForCount(id) : [],
        source: "mock",
        notFound: !count,
      });
    };
    fetchCountDetailFromServer(id)
      .then((r) => {
        if (!alive) return;
        if (r === MOCK_409) fallbackToMock();
        else if (r === null) setState((s) => ({ ...s, count: null, notFound: true, source: "supabase" }));
        else setState({ count: r.count, items: r.items, scans: r.scans, source: "supabase", notFound: false });
      })
      .catch(() => {
        if (alive) fallbackToMock();
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const cleanup = refresh();
    const onChange = () => refresh();
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      cleanup?.();
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [refresh]);

  return { ...state, loading };
}

/**
 * Reporte agregado: TODOS los conteos + TODOS sus ítems (planos). Hace fan-out de
 * las peticiones por-id (la lista de conteos suele ser corta). Fallback a demo si
 * la API está en modo mock. Alimenta Reportes › Conteos.
 */
export function useCountsReport(): {
  counts: InventoryCount[];
  items: InventoryCountItem[];
  loading: boolean;
  source: CountsSource;
} {
  const [state, setState] = useState<{
    counts: InventoryCount[];
    items: InventoryCountItem[];
    source: CountsSource;
  }>({ counts: [], items: [], source: "supabase" });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    let alive = true;
    const fallback = () => {
      if (alive) setState({ counts: mockInventoryCounts, items: mockCountItems, source: "mock" });
    };
    (async () => {
      const list = await fetchCountsFromServer();
      if (!alive) return;
      if (list === MOCK_409) {
        fallback();
        return;
      }
      // Fan-out de ítems por conteo (lista corta). Un 409/red → demo.
      const details = await Promise.all(list.map((c) => fetchCountDetailFromServer(c.id).catch(() => null)));
      if (!alive) return;
      if (details.some((d) => d === MOCK_409)) {
        fallback();
        return;
      }
      const items = details.flatMap((d) => (d && d !== MOCK_409 ? d.items : []));
      setState({ counts: list, items, source: "supabase" });
    })()
      .catch(fallback)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const cleanup = refresh();
    const onChange = () => refresh();
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      cleanup?.();
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [refresh]);

  return { ...state, loading };
}
