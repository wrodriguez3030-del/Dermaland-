"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { formatNumber } from "@/lib/utils/format";

// Paginación reutilizable para todos los listados largos del sistema.
//
// `DataPagination` es presentación pura (controlada por props). `usePagination`
// es la lógica client-side que rebana un array ya FILTRADO y ORDENADO: mantiene
// filtros/orden intactos (solo corta la vista) y resetea a la página 1 cuando
// cambian los filtros/búsqueda (vía `resetKey`) o el tamaño de página.

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface DataPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  isLoading?: boolean;
  className?: string;
}

/** Calcula los límites visibles (1-based) y el total de páginas. */
export function paginationBounds(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  return { totalPages, current, from, to };
}

export function DataPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  isLoading = false,
  className,
}: DataPaginationProps) {
  const { totalPages, current, from, to } = paginationBounds(
    page,
    pageSize,
    total,
  );
  const canPrev = current > 1;
  const canNext = current < totalPages;

  const navBtn =
    "inline-flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-[color:var(--brand-accent)] enabled:hover:text-[color:var(--brand-accent)]";

  return (
    <div
      className={`flex flex-col gap-3 border-t border-black/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[color:var(--text-soft,#6b7280)] opacity-80">
          {isLoading ? (
            "Cargando registros…"
          ) : (
            <>
              Mostrando{" "}
              <span className="font-medium tabular-nums">
                {formatNumber(from)}–{formatNumber(to)}
              </span>{" "}
              de <span className="font-medium tabular-nums">{formatNumber(total)}</span>{" "}
              registros
            </>
          )}
        </span>
        <label className="flex items-center gap-1.5 text-xs opacity-80">
          <select
            aria-label="Registros por página"
            className="h-8 rounded-lg border border-black/10 bg-white px-2 text-xs"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          por página
        </label>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={navBtn}
          onClick={() => onPageChange(1)}
          disabled={!canPrev}
          aria-label="Primera página"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Primera</span>
        </button>
        <button
          type="button"
          className={navBtn}
          onClick={() => onPageChange(current - 1)}
          disabled={!canPrev}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Anterior</span>
        </button>
        <span className="px-2 text-xs tabular-nums opacity-80">
          Página {formatNumber(current)} de {formatNumber(totalPages)}
        </span>
        <button
          type="button"
          className={navBtn}
          onClick={() => onPageChange(current + 1)}
          disabled={!canNext}
          aria-label="Página siguiente"
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={navBtn}
          onClick={() => onPageChange(totalPages)}
          disabled={!canNext}
          aria-label="Última página"
        >
          <span className="hidden sm:inline">Última</span>
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UsePaginationResult<T> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
  pageItems: T[];
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
}

export interface UsePaginationOptions {
  initialPageSize?: number;
  /**
   * Cadena que representa filtros/búsqueda activos. Al cambiar, la paginación
   * vuelve a la página 1 (no se pierde el filtro, solo se reposiciona).
   */
  resetKey?: string;
}

/**
 * Pagina client-side un array ya filtrado y ordenado. Mantiene el orden y los
 * filtros (no los toca); solo devuelve la página visible. Resetea a la página 1
 * al cambiar `resetKey` o el tamaño de página, y se ajusta si la lista encoge.
 */
export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {},
): UsePaginationResult<T> {
  const { initialPageSize = DEFAULT_PAGE_SIZE, resetKey = "" } = options;
  const [page, setPageRaw] = React.useState(1);
  const [pageSize, setPageSizeRaw] = React.useState(initialPageSize);

  // Reset a página 1 cuando cambian los filtros/búsqueda.
  React.useEffect(() => {
    setPageRaw(1);
  }, [resetKey]);

  const total = items.length;
  const { totalPages, current, from, to } = paginationBounds(
    page,
    pageSize,
    total,
  );

  // Corrige el estado si la página quedó fuera de rango (lista encogió).
  React.useEffect(() => {
    if (page !== current) setPageRaw(current);
  }, [page, current]);

  const pageItems = React.useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  const setPage = React.useCallback(
    (p: number) => setPageRaw(Math.max(1, p)),
    [],
  );
  const setPageSize = React.useCallback((s: number) => {
    setPageSizeRaw(s);
    setPageRaw(1);
  }, []);

  return {
    page: current,
    pageSize,
    total,
    totalPages,
    from,
    to,
    pageItems,
    setPage,
    setPageSize,
  };
}
