"use client";

import * as React from "react";
import { ChevronDown, Search, BadgeCheck, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SellerOption } from "@/features/sales/seller-store";

interface SellerSelectProps {
  sellers: SellerOption[];
  value: SellerOption | null;
  onChange: (seller: SellerOption | null) => void;
  loading?: boolean;
  /** Marca el trigger como requerido (borde rojo). */
  invalid?: boolean;
  className?: string;
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Súper Admin",
  admin: "Administrador",
  manager: "Gerente",
  cashier: "Cajero",
  supervisor: "Supervisor",
  vendedor: "Vendedor",
  sales: "Vendedor",
  seller: "Vendedor",
};

/**
 * Combobox buscable de VENDEDOR (responsable de la venta). Lista los
 * usuarios elegibles de la sucursal activa. Obligatorio para cobrar.
 */
export function SellerSelect({
  sellers,
  value,
  onChange,
  loading = false,
  invalid = false,
  className,
}: SellerSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  React.useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery("");
  }, [open]);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? sellers.filter((s) => s.name.toLowerCase().includes(q))
      : sellers;
    return list.slice(0, 12);
  }, [query, sellers]);

  const select = (s: SellerOption | null) => {
    onChange(s);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-left text-sm transition hover:border-[color:var(--brand-primary)]/40",
          open &&
            "border-[color:var(--brand-primary)] ring-2 ring-[color:var(--brand-primary)]/20",
          invalid && !value && "border-rose-400 ring-2 ring-rose-200",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <BadgeCheck className="h-4 w-4 shrink-0 opacity-50" />
        <div className="min-w-0 flex-1">
          {value ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{value.name}</span>
              <span className="truncate text-xs opacity-60">
                {ROLE_LABEL[value.role] ?? value.role}
              </span>
            </div>
          ) : (
            <span className={cn("opacity-60", invalid && "text-rose-600 opacity-100")}>
              Buscar o seleccionar vendedor…
            </span>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              select(null);
            }}
            className="rounded-md p-0.5 text-black/50 hover:bg-black/5 hover:text-rose-700"
            aria-label="Quitar vendedor"
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

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-black/5 bg-white shadow-lg">
          <div className="relative border-b border-black/5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar vendedor por nombre…"
              className="h-10 w-full bg-transparent pl-9 pr-3 text-sm focus:outline-none"
              autoComplete="off"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1 text-sm">
            {loading && (
              <li className="px-4 py-6 text-center text-sm opacity-60">
                Cargando vendedores…
              </li>
            )}
            {!loading && results.length === 0 && (
              <li className="px-4 py-6 text-center text-sm opacity-60">
                {sellers.length === 0
                  ? "No hay vendedores activos para esta sucursal."
                  : "Sin coincidencias."}
              </li>
            )}
            {results.map((s) => (
              <li key={s.id} role="option" aria-selected={value?.id === s.id}>
                <button
                  type="button"
                  onClick={() => select(s)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-black/[0.03]",
                    value?.id === s.id && "bg-[color:var(--brand-primary)]/5",
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/10 text-xs font-bold text-[color:var(--brand-accent)]">
                    {s.name
                      .split(" ")
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="text-[11px] opacity-60">
                      {ROLE_LABEL[s.role] ?? s.role}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
