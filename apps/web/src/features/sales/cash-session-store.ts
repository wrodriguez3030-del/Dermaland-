"use client";

import * as React from "react";
import type { CashRegisterSession } from "@/types";
import { getCurrentSession } from "@/lib/mock-data/sales";

// ─── Backend de sesiones de caja (local vs Supabase) ─────────────────────────
/**
 * Modo del backend de caja:
 *  - "local"    → datos mock del seed (solo lectura, modo demo).
 *  - "supabase" → fuente ÚNICA compartida vía /api/cash (RLS business_id).
 *
 * Se activa con `NEXT_PUBLIC_DATA_SOURCE=supabase` (build) + `DATA_SOURCE=
 * supabase` (servidor) + credenciales Supabase válidas. Por defecto: local.
 */
export const CASH_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

const CHANGE_EVENT = "dermaland:cash-changed";

/** Notifica a los hooks que la sesión de caja cambió. */
function notifyCashChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

// ─── Fetch desde servidor ────────────────────────────────────────────────────

/**
 * Lee la sesión abierta actual desde el servidor (Supabase).
 * Úsalo cuando `CASH_BACKEND === "supabase"`.
 */
export async function fetchCurrentSessionFromServer(): Promise<CashRegisterSession | null> {
  const res = await fetch("/api/cash", { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { session: CashRegisterSession | null }).session;
}

/**
 * Lee el historial de sesiones desde el servidor (Supabase).
 */
export async function fetchSessionHistoryFromServer(): Promise<CashRegisterSession[]> {
  const res = await fetch("/api/cash?history=1", { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { sessions: CashRegisterSession[] }).sessions;
}

// ─── Mutaciones ──────────────────────────────────────────────────────────────

export type OpenSessionResult =
  | { ok: true; session: CashRegisterSession }
  | { ok: false; error: string };

/**
 * Abre una nueva sesión de caja.
 * En modo supabase pega a la API compartida.
 * En modo local, la apertura requiere backend — devuelve error con
 * instrucción de activar Supabase.
 */
export async function openCashSession(
  openingAmount: number,
): Promise<OpenSessionResult> {
  if (CASH_BACKEND === "supabase") {
    try {
      const res = await fetch("/api/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingAmount }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        session?: CashRegisterSession;
        error?: string;
      };
      if (!res.ok || !body.session) {
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      notifyCashChanged();
      return { ok: true, session: body.session };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  // Modo local: apertura no soportada en demo
  return {
    ok: false,
    error:
      "Apertura de caja requiere DATA_SOURCE=supabase. En modo local usa el seed de mock-data.",
  };
}

export type CloseSessionResult =
  | { ok: true; session: CashRegisterSession }
  | { ok: false; error: string };

/**
 * Cierra una sesión de caja con el monto contado.
 * En modo supabase pega a la API compartida.
 * En modo local, el cierre requiere backend — devuelve error.
 */
export async function closeCashSession(
  sessionId: string,
  countedCash: number,
): Promise<CloseSessionResult> {
  if (CASH_BACKEND === "supabase") {
    try {
      const res = await fetch(`/api/cash/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countedCash }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        session?: CashRegisterSession;
        error?: string;
      };
      if (!res.ok || !body.session) {
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      notifyCashChanged();
      return { ok: true, session: body.session };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  // Modo local: cierre no soportado en demo
  return {
    ok: false,
    error:
      "Cierre de caja requiere DATA_SOURCE=supabase. En modo local usa el seed de mock-data.",
  };
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Hook reactivo: devuelve la sesión de caja actual.
 *
 * En modo supabase fetcha desde /api/cash y se re-renderiza al abrir/cerrar.
 * En modo local usa el seed mock de forma sincrónica.
 */
export function useCurrentCashSession(): {
  session: CashRegisterSession | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [session, setSession] = React.useState<CashRegisterSession | null>(
    () => (CASH_BACKEND === "supabase" ? null : (getCurrentSession() ?? null)),
  );
  const [loading, setLoading] = React.useState(CASH_BACKEND === "supabase");
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    if (CASH_BACKEND === "supabase") {
      setLoading(true);
      setError(null);
      fetchCurrentSessionFromServer()
        .then((s) => {
          setSession(s);
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
          // Fallback a mock para no romper la UI
          setSession(getCurrentSession() ?? null);
        });
    } else {
      setSession(getCurrentSession() ?? null);
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    if (typeof window === "undefined") return;
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, [refresh]);

  return { session, loading, error, refresh };
}

/**
 * Hook reactivo: devuelve el historial de sesiones de caja.
 *
 * En modo supabase fetcha desde /api/cash?history=1.
 * En modo local devuelve el seed de mockCashRegisterSessions (importado lazily).
 */
export function useCashSessionHistory(): {
  sessions: CashRegisterSession[];
  loading: boolean;
  error: string | null;
} {
  const [sessions, setSessions] = React.useState<CashRegisterSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (CASH_BACKEND === "supabase") {
        const data = await fetchSessionHistoryFromServer();
        setSessions(data);
        setLoading(false);
      } else {
        // Importación dinámica para evitar circular en SSR
        const { mockCashRegisterSessions } = await import(
          "@/lib/mock-data/sales"
        );
        const sorted = [...mockCashRegisterSessions].sort(
          (a, b) => +new Date(b.openedAt) - +new Date(a.openedAt),
        );
        setSessions(sorted);
        setLoading(false);
      }
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }, []);

  const handleChange = React.useCallback(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    void load();

    if (typeof window !== "undefined") {
      window.addEventListener(CHANGE_EVENT, handleChange);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(CHANGE_EVENT, handleChange);
      }
    };
  }, [load, handleChange]);

  return { sessions, loading, error };
}
