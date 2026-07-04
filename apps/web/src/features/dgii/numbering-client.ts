"use client";

import * as React from "react";
import {
  NUMBERING_BACKEND,
  listNumberings,
  createNumbering,
  updateNumbering,
  deleteNumbering,
  setNumberingActive,
  setPreferred,
  type Numbering,
  type NumberingInput,
} from "./numbering-store";

/**
 * Capa de datos "anywhere" para la pantalla de numeraciones:
 *  - supabase → `invoice_numberings` vía /api/dgii/sequences (la MISMA tabla
 *    que consume el POS al reservar — una sola fuente de verdad).
 *  - mock     → numbering-store local (demo por navegador).
 *
 * En modo supabase esta capa NO lee ni escribe localStorage.
 */

const CHANGE_EVENT = "dermaland:numberings-changed";

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export type NumberingActionResult =
  | { ok: true; numbering?: Numbering }
  | { ok: false; error: string };

async function callApi(
  path: string,
  method: string,
  body?: unknown,
): Promise<NumberingActionResult> {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as {
      numbering?: Numbering;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error ?? "No se pudo completar la operación. Intenta de nuevo.",
      };
    }
    notifyChanged();
    return { ok: true, numbering: data.numbering };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor. Intenta de nuevo." };
  }
}

export interface NumberingsState {
  numberings: Numbering[];
  loading: boolean;
  /** Error amigable de carga (solo supabase). */
  error: string | null;
  refresh: () => void;
}

/** Lista reactiva de numeraciones según backend. */
export function useNumberingsAnywhere(): NumberingsState {
  const [numberings, setNumberings] = React.useState<Numbering[]>(() =>
    NUMBERING_BACKEND === "supabase" ? [] : listNumberings(),
  );
  const [loading, setLoading] = React.useState(NUMBERING_BACKEND === "supabase");
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    if (NUMBERING_BACKEND === "supabase") {
      fetch("/api/dgii/sequences")
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            numberings?: Numbering[];
            error?: string;
          };
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setNumberings(data.numberings ?? []);
          setError(null);
        })
        .catch(() =>
          setError("No pude cargar las numeraciones. Verifica la conexión."),
        )
        .finally(() => setLoading(false));
    } else {
      setNumberings(listNumberings());
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { numberings, loading, error, refresh };
}

export async function saveNumberingAnywhere(
  input: NumberingInput,
  id?: string,
): Promise<NumberingActionResult> {
  if (NUMBERING_BACKEND === "supabase") {
    return id
      ? callApi(`/api/dgii/sequences/${id}`, "PATCH", input)
      : callApi("/api/dgii/sequences", "POST", input);
  }
  const res = id ? updateNumbering(id, input) : createNumbering(input);
  return res.ok ? { ok: true, numbering: res.numbering } : res;
}

export async function setPreferredAnywhere(
  id: string,
): Promise<NumberingActionResult> {
  if (NUMBERING_BACKEND === "supabase") {
    return callApi(`/api/dgii/sequences/${id}/prefer`, "POST");
  }
  const res = setPreferred(id);
  return res.ok ? { ok: true, numbering: res.numbering } : res;
}

export async function setActiveAnywhere(
  id: string,
  active: boolean,
): Promise<NumberingActionResult> {
  if (NUMBERING_BACKEND === "supabase") {
    return callApi(
      `/api/dgii/sequences/${id}/${active ? "activate" : "deactivate"}`,
      "POST",
    );
  }
  const res = setNumberingActive(id, active);
  return res.ok ? { ok: true, numbering: res.numbering } : res;
}

export async function deleteNumberingAnywhere(
  id: string,
): Promise<NumberingActionResult> {
  if (NUMBERING_BACKEND === "supabase") {
    return callApi(`/api/dgii/sequences/${id}`, "DELETE");
  }
  const res = deleteNumbering(id);
  return res.ok ? { ok: true } : res;
}

export interface NumberingHistoryEntry {
  action: string;
  userName: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export const HISTORY_ACTION_LABEL: Record<string, string> = {
  "dgii.numbering_created": "Numeración creada",
  "dgii.numbering_updated": "Numeración editada",
  "dgii.numbering_preferred": "Marcada como preferida",
  "dgii.numbering_activated": "Activada",
  "dgii.numbering_deactivated": "Inactivada",
  "dgii.numbering_deleted": "Eliminada",
  "dgii.sequence_reserved": "Número reservado (venta)",
};

/** Historial de auditoría de una numeración (solo supabase). */
export function useNumberingHistory(
  id: string | null,
): { history: NumberingHistoryEntry[]; loading: boolean } {
  const [history, setHistory] = React.useState<NumberingHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!id || NUMBERING_BACKEND !== "supabase") {
      setHistory([]);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/dgii/sequences/${id}/history`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          history?: NumberingHistoryEntry[];
        };
        if (alive) setHistory(res.ok ? (data.history ?? []) : []);
      })
      .catch(() => {
        if (alive) setHistory([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return { history, loading };
}
