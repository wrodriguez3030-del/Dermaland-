"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  CornerDownLeft,
  FileText,
  Loader2,
  Package,
  Receipt,
  Search,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SearchGroupKind, SearchResultItem } from "./search-types";
import { flattenResults, useGlobalSearch, type SearchState } from "./use-global-search";

const KIND_ICON: Record<SearchGroupKind, React.ComponentType<{ className?: string }>> = {
  product: Package,
  customer: User,
  invoice: Receipt,
  proforma: FileText,
  lot: Boxes,
};

const PLACEHOLDER = "Buscar producto, cliente, lote, e-NCF…";

/** Controlador compartido por la versión de escritorio y la móvil. */
function useSearchController(onDone?: () => void) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const state = useGlobalSearch(query);

  const results =
    state.status === "success"
      ? state.results
      : state.status === "loading"
        ? state.results
        : undefined;
  const items = React.useMemo(() => flattenResults(results), [results]);

  React.useEffect(() => setActive(0), [query]);

  const reset = React.useCallback(() => {
    setQuery("");
    setActive(0);
  }, []);

  const select = React.useCallback(
    (item: SearchResultItem | undefined) => {
      if (!item) return;
      router.push(item.href);
      reset();
      onDone?.();
    },
    [router, reset, onDone],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        if (items.length > 0) {
          e.preventDefault();
          select(items[active]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDone?.();
      }
    },
    [items, active, select, onDone],
  );

  return { query, setQuery, active, setActive, state, items, select, onKeyDown, reset };
}

// ─── Lista de resultados (presentacional) ────────────────────────────────────

function ResultsList({
  state,
  items,
  active,
  onHover,
  onSelect,
  query,
}: {
  state: SearchState;
  items: SearchResultItem[];
  active: number;
  onHover: (i: number) => void;
  onSelect: (item: SearchResultItem) => void;
  query: string;
}) {
  const router = useRouter();
  const results = state.status === "success" || state.status === "loading" ? state.results : undefined;

  if (state.status === "idle") return null;

  if (state.status === "error") {
    return (
      <div className="px-4 py-6 text-center text-sm text-rose-600">{state.message}</div>
    );
  }

  const isLoading = state.status === "loading";
  const hasResults = !!results && results.total > 0;

  if (isLoading && !hasResults) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm opacity-60">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
      </div>
    );
  }

  if (!hasResults) {
    return (
      <div className="px-4 py-6 text-center text-sm opacity-70">
        No encontramos resultados para “{query.trim()}”.
      </div>
    );
  }

  let flatIndex = -1;
  return (
    <div className="max-h-[70vh] overflow-y-auto py-1">
      {results!.groups.map((group) => {
        const Icon = KIND_ICON[group.kind];
        return (
          <div key={group.kind} className="py-1">
            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide opacity-45">
              {group.label}
            </div>
            {group.items.map((item) => {
              flatIndex += 1;
              const idx = flatIndex;
              const isActive = idx === active;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  data-search-index={idx}
                  onMouseEnter={() => onHover(idx)}
                  onClick={() => onSelect(item)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left",
                    isActive ? "bg-[color:var(--brand-primary)]/10" : "hover:bg-black/[0.03]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      isActive
                        ? "bg-[color:var(--brand-primary)]/15 text-[color:var(--brand-accent)]"
                        : "bg-black/[0.04] opacity-70",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    {item.subtitle && (
                      <span className="block truncate text-xs opacity-60">{item.subtitle}</span>
                    )}
                  </span>
                  {item.meta && (
                    <span className="shrink-0 text-xs tabular-nums opacity-60">{item.meta}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => router.push(`/buscar?q=${encodeURIComponent(query.trim())}`)}
        className="mt-1 flex w-full items-center justify-between border-t border-black/5 px-3 py-2 text-xs font-medium text-[color:var(--brand-accent)] hover:bg-black/[0.03]"
      >
        <span>Ver todos los resultados ({results!.total})</span>
        <CornerDownLeft className="h-3.5 w-3.5 opacity-50" />
      </button>
    </div>
  );
}

// ─── Escritorio: input inline + dropdown ─────────────────────────────────────

export function GlobalSearch({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const ctrl = useSearchController(() => setOpen(false));

  // Cerrar al hacer clic fuera.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Mantener el ítem activo visible.
  React.useEffect(() => {
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-search-index="${ctrl.active}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [ctrl.active]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
      <input
        type="search"
        role="searchbox"
        aria-label="Buscar en todo el negocio"
        value={ctrl.query}
        onChange={(e) => {
          ctrl.setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={ctrl.onKeyDown}
        placeholder={PLACEHOLDER}
        className="h-9 w-full rounded-lg border border-black/10 bg-black/[0.02] pl-9 pr-3 text-sm placeholder:text-black/40 focus:border-[color:var(--brand-primary)] focus:bg-white focus:outline-none"
      />
      {open && ctrl.state.status !== "idle" && (
        <div className="absolute left-0 right-0 top-11 z-30 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl">
          <ResultsList
            state={ctrl.state}
            items={ctrl.items}
            active={ctrl.active}
            onHover={ctrl.setActive}
            onSelect={ctrl.select}
            query={ctrl.query}
          />
        </div>
      )}
    </div>
  );
}

// ─── Móvil: botón lupa que abre un panel completo ────────────────────────────

export function GlobalSearchMobile({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ctrl = useSearchController(() => setOpen(false));

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Buscar"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5",
          className,
        )}
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 opacity-40" />
            <input
              ref={inputRef}
              type="search"
              role="searchbox"
              aria-label="Buscar en todo el negocio"
              value={ctrl.query}
              onChange={(e) => ctrl.setQuery(e.target.value)}
              onKeyDown={ctrl.onKeyDown}
              placeholder={PLACEHOLDER}
              className="h-10 flex-1 bg-transparent text-base placeholder:text-black/40 focus:outline-none"
            />
            <button
              type="button"
              aria-label="Cerrar búsqueda"
              onClick={() => {
                ctrl.reset();
                setOpen(false);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {ctrl.state.status === "idle" ? (
              <p className="px-4 py-6 text-center text-sm opacity-60">
                Escribe al menos 2 caracteres para buscar productos, clientes, facturas,
                proformas y lotes.
              </p>
            ) : (
              <ResultsList
                state={ctrl.state}
                items={ctrl.items}
                active={ctrl.active}
                onHover={ctrl.setActive}
                onSelect={ctrl.select}
                query={ctrl.query}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
