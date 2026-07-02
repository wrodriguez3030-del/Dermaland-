"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { useLaboratoriesList } from "@/features/products/catalog-store";
import {
  normalizeLabName,
  laboratoryTypeByName,
} from "@/lib/mock-data/laboratory-seed";
import type { Laboratory } from "@/types";

/** Subtítulo "País · Tipo" del laboratorio/proveedor. */
function subtitle(lab: Laboratory): string {
  const type = lab.type ?? laboratoryTypeByName(lab.name) ?? "Laboratorio";
  return [lab.country, type].filter(Boolean).join(" · ");
}

export interface SupplierSelectProps {
  /** Nombre del proveedor seleccionado (texto). "" = ninguno. */
  value: string;
  onChange: (name: string) => void;
  invalid?: boolean;
}

/**
 * Combobox de Proveedor para Compras. Busca en el catálogo de laboratorios
 * (ISDIN, La Roche-Posay, etc.) por nombre, ignorando mayúsculas/acentos, con
 * menú amplio (≥420px / alto 360px con scroll) usable en móvil. Permite además
 * escribir un proveedor libre ("Usar '…' como proveedor") cuando no está en el
 * catálogo. El valor guardado es el NOMBRE (el modelo de factura usa
 * supplierName, no un id).
 */
export function SupplierSelect({ value, onChange, invalid }: SupplierSelectProps) {
  const laboratories = useLaboratoriesList();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const nq = normalizeLabName(query);
  const filtered = React.useMemo(() => {
    const base = nq
      ? laboratories.filter((l) => normalizeLabName(l.name).includes(nq))
      : [...laboratories];
    return base.sort((a, b) => a.name.localeCompare(b.name));
  }, [laboratories, nq]);
  const exactExists = !!nq && laboratories.some((l) => normalizeLabName(l.name) === nq);

  const pick = (name: string) => {
    onChange(name.trim());
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="Buscar proveedor o laboratorio"
        className={`h-11 w-full rounded-lg border bg-white px-3 pr-8 text-sm placeholder:text-black/40 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20 ${
          invalid ? "border-rose-500 bg-rose-50/60" : "border-black/15"
        }`}
        placeholder="Buscar proveedor o laboratorio..."
        value={open ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
      />
      {value && !open && (
        <button
          type="button"
          aria-label="Quitar proveedor"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-black/10"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
        >
          <X className="h-3.5 w-3.5 opacity-60" />
        </button>
      )}
      {open && (
        <ul
          role="listbox"
          className="absolute z-40 mt-1 max-h-[360px] w-full min-w-[min(420px,92vw)] max-w-[92vw] overflow-auto rounded-lg border border-black/10 bg-white py-1 text-sm shadow-xl"
        >
          {filtered.map((l) => (
            <li
              key={l.id}
              role="option"
              aria-selected={l.name === value}
              className="cursor-pointer px-3 py-2.5 hover:bg-[color:var(--brand-primary)]/10"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(l.name);
              }}
            >
              <div className="font-medium leading-tight">{l.name}</div>
              <div className="text-xs leading-tight text-black/55">{subtitle(l)}</div>
            </li>
          ))}
          {nq !== "" && filtered.length === 0 && (
            <li className="px-3 py-2 text-black/60">Sin resultados en el catálogo.</li>
          )}
          {nq !== "" && !exactExists && (
            <li
              role="option"
              aria-selected={false}
              className="flex cursor-pointer items-center gap-2 border-t border-black/5 px-3 py-2.5 font-medium text-[color:var(--brand-accent)] hover:bg-[color:var(--brand-primary)]/10"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(query.trim());
              }}
            >
              <Plus className="h-4 w-4" /> Usar “{query.trim()}” como proveedor
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
