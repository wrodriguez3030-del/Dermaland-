"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  Loader2,
  Search,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Customer } from "@/types";
import { fetchCustomersFromServer } from "@/features/customers/customer-store";
import { billingTypeLabel } from "@/features/customers/billing";
import { useDebounce } from "@/components/ui/use-debounce";

/** Tope de resultados del desplegable — nunca la base entera. */
const LIMITE_RESULTADOS = 10;
/** Menos de esto no busca: dos letras evitan traer medio catálogo por azar. */
const MIN_CARACTERES = 2;

interface CustomerSearchSelectProps {
  value?: Customer | null;
  onChange: (customer: Customer | null) => void;
  /** Permite "walk-in / consumidor final" como opción explícita. Default true. */
  allowWalkIn?: boolean;
  /** Path para "Crear nuevo cliente". Default `/clientes/nuevo`. */
  createHref?: string;
  /** Callback alternativo si se prefiere abrir modal en lugar de navegar. */
  onCreateNew?: () => void;
  /** Tamaño del trigger. */
  size?: "sm" | "md";
  /** Marca el trigger como requerido (borde rojo) — ej. cliente obligatorio. */
  invalid?: boolean;
  className?: string;
}

/** Handle imperativo para abrir/enfocar el selector desde el padre. */
export interface CustomerSearchSelectHandle {
  open: () => void;
  focus: () => void;
}

/**
 * Selector con búsqueda EN EL SERVIDOR (nombre, teléfono, documento) contra
 * `GET /api/customers?search=…&limit=…`. Reutilizable en POS, proformas y
 * cualquier flujo de facturación.
 *
 * 🔴 Antes traía la base ENTERA (`useCustomers()`, ~2,8 MB / 6 500+ clientes,
 * 2-3 s) solo para filtrarla en el navegador dentro de un cuadro que muestra
 * 10 resultados — medido en vivo el 10/09/2026 al abrir el POS. Ahora no pide
 * nada hasta que el cajero escribe ≥2 caracteres, y cada búsqueda trae como
 * máximo `LIMITE_RESULTADOS` filas. A cambio se pierde el listado de
 * "recientes" al abrir vacío (la base no expone esa vista sin descargarla
 * entera): se pide escribir, como cualquier buscador de un catálogo grande.
 *
 * - Cuando no hay valor seleccionado, muestra "Cliente: walk-in".
 * - Click → dropdown con input + resultados del servidor (debounce 300 ms).
 * - Sin resultados → CTA "Crear nuevo cliente".
 * - Selección → cierra y emite `onChange(customer)`.
 * - Botón ✕ para volver a walk-in.
 */
export const CustomerSearchSelect = React.forwardRef<
  CustomerSearchSelectHandle,
  CustomerSearchSelectProps
>(function CustomerSearchSelect(
  {
    value,
    onChange,
    allowWalkIn = true,
    createHref = "/clientes/nuevo",
    onCreateNew,
    size = "md",
    invalid = false,
    className,
  },
  ref,
) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [results, setResults] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      open: () => setOpen(true),
      focus: () => {
        setOpen(true);
        containerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      },
    }),
    [],
  );

  // Cerrar al click fuera o ESC
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus al input cuando abre
  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [open]);

  // Busca en el servidor cuando hay suficiente texto — nunca al abrir vacío.
  React.useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < MIN_CARACTERES) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    fetchCustomersFromServer({ search: q, limit: LIMITE_RESULTADOS })
      .then((customers) => {
        if (!alive) return;
        setResults(customers);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "No se pudo buscar clientes.");
        setResults([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [debouncedQuery]);

  const handleSelect = (c: Customer | null) => {
    onChange(c);
    setOpen(false);
    setQuery("");
  };

  const triggerHeight = size === "sm" ? "h-9" : "h-10";
  const queryTrimmed = query.trim();

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Trigger — `<div role="button">`, no `<button>`: lleva DENTRO el botón
          "Quitar cliente" (✕), y un <button> no puede anidar otro <button>
          en HTML — React lo dejaba pasar en el cliente pero reventaba la
          hidratación (visto en vivo el 10/09/2026). Mismo patrón accesible
          que la tarjeta de producto del POS (`ProductCard`): div clickable +
          rol y teclado, no botón anidado. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-left text-sm transition hover:border-[color:var(--brand-primary)]/40",
          triggerHeight,
          open && "border-[color:var(--brand-primary)] ring-2 ring-[color:var(--brand-primary)]/20",
          invalid && !value && "border-rose-400 ring-2 ring-rose-200",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <User className="h-4 w-4 shrink-0 opacity-50" />
        <div className="min-w-0 flex-1">
          {value ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">
                {value.firstName} {value.lastName}
              </span>
              <span className="truncate text-xs opacity-60">
                {value.phone ?? value.whatsapp ?? value.documentNumber ?? ""}
              </span>
            </div>
          ) : (
            <span className={cn("opacity-60", invalid && "text-rose-600 opacity-100")}>
              {allowWalkIn
                ? "Cliente: walk-in / consumidor final"
                : "Selecciona un cliente para facturar"}
            </span>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSelect(null);
            }}
            className="rounded-md p-0.5 text-black/50 hover:bg-black/5 hover:text-rose-700"
            aria-label="Quitar cliente"
            title="Quitar cliente"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 opacity-50 transition-transform",
            open && "rotate-180",
          )}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-black/5 bg-white shadow-lg">
          <div className="relative border-b border-black/5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, teléfono, cédula, email…"
              className="h-10 w-full bg-transparent pl-9 pr-3 text-sm focus:outline-none"
              autoComplete="off"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin opacity-50" />
            )}
          </div>

          <ul
            role="listbox"
            className="max-h-80 overflow-y-auto py-1 text-sm"
          >
            {allowWalkIn && (
              <li role="option" aria-selected={!value}>
                <button
                  type="button"
                  onClick={() => handleSelect(null)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-black/[0.03]",
                    !value && "bg-[color:var(--brand-primary)]/5",
                  )}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.06] text-black/60">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <div className="font-medium">Walk-in / Consumidor final</div>
                    <div className="text-xs opacity-60">
                      Sin RNC · e-CF tipo 32 (Consumo) por defecto
                    </div>
                  </div>
                </button>
              </li>
            )}

            {queryTrimmed.length < MIN_CARACTERES && (
              <li className="px-4 py-6 text-center text-sm opacity-60">
                Escribe para buscar por nombre, teléfono, cédula o email.
              </li>
            )}

            {error && (
              <li className="px-4 py-4 text-center text-sm text-rose-700">{error}</li>
            )}

            {!error && queryTrimmed.length >= MIN_CARACTERES && results.length > 0 && (
              <li
                aria-hidden
                className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-50"
              >
                Resultados
              </li>
            )}

            {results.map((c) => (
              <li key={c.id} role="option" aria-selected={value?.id === c.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-black/[0.03]",
                    value?.id === c.id && "bg-[color:var(--brand-primary)]/5",
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/10 text-xs font-bold text-[color:var(--brand-accent)]">
                    {(c.firstName[0] ?? "·") + (c.lastName[0] ?? "")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {c.firstName} {c.lastName}
                      </span>
                      <span className="text-[10px] font-mono opacity-50">
                        {c.customerNumber}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] opacity-70">
                      {c.phone && <span>📞 {c.phone}</span>}
                      {c.documentNumber && <span>🆔 {c.documentNumber}</span>}
                      {c.email && <span className="truncate">✉ {c.email}</span>}
                    </div>
                    <div className="mt-0.5 text-[10px] opacity-60">
                      {billingTypeLabel(c.defaultBillingType)}
                      {c.tags.length > 0 && (
                        <span className="ml-2">· {c.tags.slice(0, 2).join(" · ")}</span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}

            {!error &&
              !loading &&
              queryTrimmed.length >= MIN_CARACTERES &&
              results.length === 0 && (
                <li className="px-4 py-6 text-center text-sm">
                  <div className="opacity-60">No se encontraron clientes.</div>
                </li>
              )}
          </ul>

          <div className="border-t border-black/5">
            {onCreateNew ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateNew();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--brand-accent)] hover:bg-[color:var(--brand-primary)]/5"
              >
                <UserPlus className="h-4 w-4" />
                Crear nuevo cliente
                {queryTrimmed.length >= MIN_CARACTERES && (
                  <span className="opacity-60"> · "{query}"</span>
                )}
              </button>
            ) : (
              <Link
                href={createHref}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--brand-accent)] hover:bg-[color:var(--brand-primary)]/5"
              >
                <UserPlus className="h-4 w-4" />
                Crear nuevo cliente
                {queryTrimmed.length >= MIN_CARACTERES && (
                  <span className="opacity-60"> · "{query}"</span>
                )}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
