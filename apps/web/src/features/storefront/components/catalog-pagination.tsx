import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildCatalogHref } from "../catalog-params";
import type { CatalogQuery, CatalogResult } from "../types";

/**
 * Paginación del catálogo, con enlaces reales.
 *
 * Son `<a>` y no botones: cada página tiene su URL, se puede abrir en otra
 * pestaña, volver con el botón "atrás" y —lo que importa aquí— ser rastreada
 * por un buscador. Una paginación por JavaScript dejaría el catálogo entero
 * invisible salvo la primera página.
 */
export function CatalogPagination({
  query,
  result,
}: {
  query: CatalogQuery;
  result: CatalogResult;
}) {
  if (result.pageCount <= 1) return null;

  const actual = result.page;
  const anterior = actual > 1 ? buildCatalogHref(query, { page: actual - 1 }) : null;
  const siguiente = actual < result.pageCount ? buildCatalogHref(query, { page: actual + 1 }) : null;

  return (
    <nav
      aria-label="Páginas del catálogo"
      className="mt-10 flex items-center justify-center gap-3"
    >
      <Salto href={anterior} rel="prev">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        <span>Anterior</span>
      </Salto>

      <p aria-live="polite" className="text-sm text-[color:var(--brand-fg)]/70">
        Página <strong className="font-semibold text-[color:var(--brand-fg)]">{actual}</strong> de{" "}
        {result.pageCount}
      </p>

      <Salto href={siguiente} rel="next">
        <span>Siguiente</span>
        <ChevronRight aria-hidden className="h-4 w-4" />
      </Salto>
    </nav>
  );
}

/** Enlace de salto; deshabilitado (no enlace) en los extremos. */
function Salto({
  href,
  rel,
  children,
}: {
  href: string | null;
  rel: "prev" | "next";
  children: React.ReactNode;
}) {
  const clases =
    "inline-flex min-h-11 items-center gap-1 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium";
  if (!href) {
    return (
      <span aria-disabled className={`${clases} opacity-40`}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      rel={rel}
      className={`${clases} text-[color:var(--brand-fg)] transition-colors hover:border-[color:var(--brand-accent)] hover:text-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]`}
    >
      {children}
    </a>
  );
}
