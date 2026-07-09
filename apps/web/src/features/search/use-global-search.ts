"use client";

import * as React from "react";
import type { GlobalSearchResults, SearchResultItem } from "./search-types";
import { hasEnoughChars } from "./search-core";

export type SearchState =
  | { status: "idle" }
  | { status: "loading"; results?: GlobalSearchResults }
  | { status: "success"; results: GlobalSearchResults }
  | { status: "error"; message: string };

const EMPTY: GlobalSearchResults = { query: "", groups: [], total: 0 };

/**
 * Búsqueda global con debounce + cancelación. Devuelve el estado de la última
 * consulta vigente (idle / loading / success / error). Aborta el fetch anterior
 * al cambiar el término (evita respuestas fuera de orden / caché vieja).
 */
export function useGlobalSearch(query: string, debounceMs = 300): SearchState {
  const [state, setState] = React.useState<SearchState>({ status: "idle" });

  React.useEffect(() => {
    const q = query.trim();
    if (!hasEnoughChars(q)) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setState((s) => ({
        status: "loading",
        results: s.status === "success" ? s.results : undefined,
      }));
      fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: ctrl.signal,
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as GlobalSearchResults;
        })
        .then((data) => setState({ status: "success", results: data ?? EMPTY }))
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setState({
            status: "error",
            message: "No se pudo realizar la búsqueda. Intenta nuevamente.",
          });
        });
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, debounceMs]);

  return state;
}

/** Aplana los grupos en una sola lista (para navegación por teclado). */
export function flattenResults(results: GlobalSearchResults | undefined): SearchResultItem[] {
  if (!results) return [];
  return results.groups.flatMap((g) => g.items);
}
