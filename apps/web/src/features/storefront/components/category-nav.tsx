import Link from "next/link";
import { buildCatalogHref, categoryHref } from "../catalog-params";
import type { PublicTaxonomy } from "../types";

/** Cuántas categorías caben en el encabezado sin volverlo un menú. */
const VISIBLES = 7;

/**
 * Navegación por categorías, debajo del encabezado.
 *
 * Se desplaza de lado en móvil en vez de plegarse tras un botón: un menú
 * escondería la única pista que tiene el visitante de qué vende esta tienda.
 *
 * Se ordenan por cuántos productos publicados tienen, para que lo primero que
 * se vea sea lo que la tienda de verdad surte.
 */
export function CategoryNav({
  categories,
}: {
  categories: readonly PublicTaxonomy[];
}) {
  const visibles = [...categories]
    .sort(
      (a, b) =>
        b.productCount - a.productCount || a.name.localeCompare(b.name, "es"),
    )
    .slice(0, VISIBLES);

  if (visibles.length === 0) return null;

  return (
    <nav
      aria-label="Categorías"
      className="border-t border-black/5 bg-white/90 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
        {visibles.map((categoria) => (
          <li key={categoria.slug} className="shrink-0">
            <Link
              href={categoryHref(categoria.slug)}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-[color:var(--brand-fg)]/80 hover:bg-[color:var(--brand-primary)]/5 hover:text-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
            >
              {categoria.name}
            </Link>
          </li>
        ))}
        <li className="shrink-0">
          <Link
            href={buildCatalogHref({})}
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
          >
            Ver todo
          </Link>
        </li>
      </ul>
    </nav>
  );
}
