import { Search } from "lucide-react";
import { CATALOG_BASE, CATALOG_PARAM } from "../catalog-params";

/**
 * Buscador de la tienda.
 *
 * `<form method="get">` y nada más: sin estado, sin JavaScript, sin hidratación.
 * Funciona antes de que cargue un solo kilobyte de React, se envía con Intro, y
 * la URL que produce es exactamente la que el cliente copia y comparte por
 * WhatsApp. La barra de filtros del catálogo ya usa este mismo patrón.
 *
 * `id` viene por parámetro porque el buscador aparece DOS veces en el
 * encabezado —una para escritorio y otra para móvil— y dos `<label for>`
 * apuntando al mismo `id` dejarían el segundo campo sin etiqueta.
 */
export function SearchBox({
  id = "buscador-tienda",
  defaultValue,
  className,
}: {
  id?: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <form method="get" action={CATALOG_BASE} role="search" className={className}>
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--brand-fg)]/40"
        />
        <input
          id={id}
          type="search"
          name={CATALOG_PARAM.q}
          defaultValue={defaultValue}
          placeholder="Buscar por producto o marca…"
          autoComplete="off"
          className="min-h-11 w-full rounded-full border border-black/10 bg-white pl-10 pr-4 text-sm text-[color:var(--brand-fg)] placeholder:text-[color:var(--brand-fg)]/40 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20"
        />
      </div>
    </form>
  );
}
