"use client";

import { cn } from "@/lib/utils/cn";
import { ATAJOS, ETIQUETA_PERSONALIZADO, type QuickRangeKey } from "./atajos-de-fecha";

const BASE =
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40";
const ACTIVO = "border-[color:var(--brand-fg)] bg-[color:var(--brand-fg)] text-white";
const INACTIVO =
  "border-slate-200 bg-white text-slate-600 hover:border-[color:var(--brand-primary)]/50";

/**
 * Fila de pastillas de atajo. El texto visible de cada una ("Hoy", "Todo",
 * …) no cambia respecto al botón que reemplaza — las pruebas existentes las
 * ubican por ese texto.
 */
export function ChipsDeAtajo({
  activo,
  montado,
  atajos = ATAJOS.map((a) => a.clave),
  onElegir,
}: {
  activo: QuickRangeKey | null;
  montado: boolean;
  atajos?: readonly QuickRangeKey[];
  onElegir: (clave: QuickRangeKey) => void;
}) {
  const visibles = ATAJOS.filter((a) => atajos.includes(a.clave));
  const personalizado = montado && activo === null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visibles.map(({ clave, etiqueta }) => (
        <button
          key={clave}
          type="button"
          aria-pressed={montado && activo === clave}
          onClick={() => onElegir(clave)}
          className={cn(BASE, montado && activo === clave ? ACTIVO : INACTIVO)}
        >
          {etiqueta}
        </button>
      ))}
      {personalizado && (
        <span
          aria-pressed="true"
          className={cn(BASE, ACTIVO, "cursor-default")}
        >
          {ETIQUETA_PERSONALIZADO}
        </span>
      )}
    </div>
  );
}
