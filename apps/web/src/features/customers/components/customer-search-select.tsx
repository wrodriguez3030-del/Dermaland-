"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  Search,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Customer } from "@/types";
import { searchClients } from "@/features/customers/utils/search-clients";
import { billingTypeLabel } from "@/features/customers/billing";

interface CustomerSearchSelectProps {
  clients: Customer[];
  value?: Customer | null;
  onChange: (customer: Customer | null) => void;
  /** Permite "walk-in / consumidor final" como opción explícita. Default true. */
  allowWalkIn?: boolean;
  /** Filtra por business_id (multi-tenancy). */
  businessId?: string;
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
 * Selector con búsqueda contra varios campos: nombre, teléfono, WhatsApp,
 * documento, email, customer number. Reutilizable en POS, proformas y
 * cualquier flujo de facturación.
 *
 * - Cuando no hay valor seleccionado, muestra "Cliente: walk-in".
 * - Click → dropdown con input + lista filtrada (max 10).
 * - Sin resultados → CTA "Crear nuevo cliente".
 * - Selección → cierra y emite `onChange(customer)`.
 * - Botón ✕ para volver a walk-in.
 */
export const CustomerSearchSelect = React.forwardRef<
  CustomerSearchSelectHandle,
  CustomerSearchSelectProps
>(function CustomerSearchSelect(
  {
    clients,
    value,
    onChange,
    allowWalkIn = true,
    businessId,
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
    }
  }, [open]);

  const results = React.useMemo(
    () => searchClients(query, clients, { businessId, limit: 10 }),
    [query, clients, businessId],
  );

  const handleSelect = (c: Customer | null) => {
    onChange(c);
    setOpen(false);
    setQuery("");
  };

  const triggerHeight = size === "sm" ? "h-9" : "h-10";

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-left text-sm transition hover:border-[color:var(--brand-primary)]/40",
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
      </button>

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

            {results.length > 0 && (
              <li
                aria-hidden
                className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-50"
              >
                {query.trim().length === 0 ? "Recientes" : "Resultados"}
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

            {query.trim().length >= 2 && results.length === 0 && (
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
                {query.trim().length >= 2 && (
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
                {query.trim().length >= 2 && (
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
