"use client";

import * as React from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Barra de filtros. En escritorio (≥ md) muestra los filtros en línea. En móvil
 * se colapsan detrás de un botón "Filtros" (44px táctil) para no ocupar la
 * pantalla; al tocarlo se despliegan apilados. Comportamiento central: aplica a
 * todas las pantallas que usan FilterBar sin tocarlas una por una.
 */
export function FilterBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={cn("rounded-xl border border-black/5 bg-white", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between gap-2 px-3 text-sm font-medium md:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" /> Filtros
        </span>
        <ChevronDown className={cn("h-4 w-4 opacity-60 transition-transform", open && "rotate-180")} />
      </button>
      <div
        className={cn(
          "flex-wrap items-center gap-2 p-2 md:flex",
          open ? "flex border-t border-black/5 md:border-t-0" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Sección de formulario: título arriba, descripción debajo, campos a continuación.
 *
 * Antes era un grid de 3 columnas (1 título / 2 inputs) que dejaba mucho
 * espacio vacío a la izquierda en pantallas wide. Ahora apila verticalmente —
 * más compacto y consistente. Cada sección queda separada por una línea sutil
 * (`border-b`), sin necesidad de envolver cada una en su propia card.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-b border-black/5 py-6 first:pt-0 last:border-b-0 last:pb-0",
        className,
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="mt-1 text-xs opacity-60">{description}</p>
        )}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
