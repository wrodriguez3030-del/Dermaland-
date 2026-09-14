"use client";

import * as React from "react";
import { Building2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  alternarSucursal,
  etiquetaSucursales,
  type OpcionSucursal,
} from "./sucursales-seleccion";

/**
 * Selector de sucursales. Con `multiple` (por defecto) permite marcar varias
 * — `[]` es "todas". Con `multiple={false}` se comporta como un selector de
 * una sola (uso de las pantallas cuyo backend solo admite una sucursal):
 * elegir una la deja sola, volver a tocarla vuelve a `[]` ("todas").
 */
export function SucursalesMultiSelect({
  opciones,
  seleccionadas,
  onChange,
  multiple = true,
  "aria-label": ariaLabel = "Locales / Sucursales",
}: {
  opciones: readonly OpcionSucursal[];
  seleccionadas: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  "aria-label"?: string;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const etiqueta = etiquetaSucursales(seleccionadas, opciones);

  const elegir = (id: string) => {
    if (!multiple) {
      onChange(seleccionadas.length === 1 && seleccionadas[0] === id ? [] : [id]);
      setAbierto(false);
      return;
    }
    onChange(alternarSucursal(seleccionadas, id, opciones));
  };

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="mt-0 flex h-10 w-full items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-sm focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span className="flex-1 truncate text-left">{etiqueta}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {abierto && (
        <>
          {/* Overlay para cerrar al tocar fuera. */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div
            role="listbox"
            aria-multiselectable={multiple}
            className="absolute left-0 z-50 mt-1 max-h-64 w-[min(16rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
          >
            {multiple && (
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setAbierto(false);
                }}
                className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-[color:var(--brand-primary)] hover:bg-black/5"
              >
                Seleccionar todas
              </button>
            )}
            {opciones.map((o) => {
              const marcada =
                seleccionadas.length === 0 || seleccionadas.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={marcada}
                  onClick={() => elegir(o.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      marcada
                        ? "border-[color:var(--brand-fg)] bg-[color:var(--brand-fg)] text-white"
                        : "border-slate-300",
                    )}
                  >
                    {marcada && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor">
                        <path d="M4.7 8.3 2.4 6l-1 1 3.3 3.3L10 4l-1-1z" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{o.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
