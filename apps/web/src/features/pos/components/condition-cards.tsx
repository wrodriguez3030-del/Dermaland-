"use client";

import * as React from "react";
import { Sparkles, CircleDot, Snowflake, Feather, CloudSun, SunMedium, X } from "lucide-react";
import { CONDICIONES_POS } from "../pos-condiciones";

const ICONOS: Record<string, React.ComponentType<{ className?: string }>> = {
  manchas: Sparkles,
  acne: CircleDot,
  caspa: Snowflake,
  "caida-cabello": Feather,
  "filtro-seca": CloudSun,
  "filtro-grasa": SunMedium,
};

export interface CondicionCardsProps {
  /** Clave de la condición activa, o `null` si ninguna está seleccionada. */
  activa: string | null;
  onSeleccionar: (key: string) => void;
  onLimpiar: () => void;
}

/**
 * Tarjetas de "el cliente dice el problema" — Manchas, Acné, Caspa… Un clic
 * filtra el catálogo por esa necesidad (ver `pos-condiciones.ts`) sin que el
 * cajero tenga que saber qué marca la resuelve. Se ve como tarjeta, no como
 * botón de texto plano: es lo primero que toca alguien parado en caja.
 */
export function CondicionCards({ activa, onSeleccionar, onLimpiar }: CondicionCardsProps) {
  const seleccionada = CONDICIONES_POS.find((c) => c.key === activa) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-black/5 px-4 pb-4">
      {CONDICIONES_POS.map((c) => {
        const Icon = ICONOS[c.key] ?? Sparkles;
        const activo = c.key === activa;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => (activo ? onLimpiar() : onSeleccionar(c.key))}
            aria-pressed={activo}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium shadow-sm transition ${
              activo
                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-[color:var(--brand-primary)] hover:shadow-md"
            }`}
          >
            <Icon className={`h-4 w-4 ${activo ? "text-white" : "text-[color:var(--brand-primary)]"}`} />
            {c.label}
          </button>
        );
      })}
      {seleccionada && (
        <button
          type="button"
          onClick={onLimpiar}
          className="ml-1 flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-black/60 hover:bg-black/10"
        >
          Filtrando por: <strong className="text-black/80">{seleccionada.label}</strong>
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
