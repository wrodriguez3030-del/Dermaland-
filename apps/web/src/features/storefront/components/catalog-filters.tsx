import { Search } from "lucide-react";
import { CATALOG_PARAM, SORT_LABELS, buildCatalogHref, hasActiveFilters } from "../catalog-params";
import { CATALOG_SORTS, type CatalogQuery, type PublicTaxonomy } from "../types";

/**
 * Búsqueda, filtros y orden del catálogo.
 *
 * Es un `<form method="get">` de HTML, sin estado ni JavaScript propio: se envía
 * al mismo `/tienda`, que vuelve a renderizar en el servidor. Así el catálogo
 * funciona con la conexión de datos flaqueando y con el bundle a medio cargar
 * —el escenario normal de un móvil en la calle—, y cada combinación de filtros
 * queda en una URL que se puede compartir por WhatsApp.
 *
 * Las marcas y categorías vienen ya contadas: no se ofrece un filtro que
 * llevaría a una pantalla vacía.
 */
export function CatalogFilters({
  query,
  brands,
  categories,
}: {
  query: CatalogQuery;
  brands: PublicTaxonomy[];
  categories: PublicTaxonomy[];
}) {
  const hayFiltros = hasActiveFilters(query);

  return (
    <form
      method="get"
      action="/tienda"
      className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
        <div className="relative">
          <label htmlFor="buscar" className="sr-only">
            Buscar productos
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--brand-fg)]/40"
          />
          <input
            id="buscar"
            type="search"
            name={CATALOG_PARAM.q}
            defaultValue={query.q ?? ""}
            placeholder="Buscar por producto o marca"
            className="min-h-11 w-full rounded-xl border border-black/10 bg-white py-2 pl-9 pr-3 text-sm text-[color:var(--brand-fg)] placeholder:text-[color:var(--brand-fg)]/40 focus:border-[color:var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]/30"
          />
        </div>

        <Selector
          id="marca"
          name={CATALOG_PARAM.brand}
          label="Marca"
          vacío="Todas las marcas"
          valor={query.brandSlug}
          opciones={brands}
        />

        <Selector
          id="categoria"
          name={CATALOG_PARAM.category}
          label="Categoría"
          vacío="Todas las categorías"
          valor={query.categorySlug}
          opciones={categories}
        />

        <div>
          <label htmlFor="orden" className="sr-only">
            Ordenar por
          </label>
          <select
            id="orden"
            name={CATALOG_PARAM.sort}
            defaultValue={query.sort ?? "relevancia"}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-3 text-sm text-[color:var(--brand-fg)] focus:border-[color:var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]/30"
          >
            {CATALOG_SORTS.map((orden) => (
              <option key={orden} value={orden}>
                {SORT_LABELS[orden]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Tailwind 4 quitó el `cursor: pointer` por defecto de los botones:
              sin `cursor-pointer` explícito el puntero no cambia y el botón no
              parece pulsable. */}
          <button
            type="submit"
            className="min-h-11 flex-1 cursor-pointer rounded-xl bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--brand-accent)] md:flex-none"
          >
            Filtrar
          </button>
          {hayFiltros ? (
            <a
              href={buildCatalogHref(query, {
                q: undefined,
                brandSlug: undefined,
                categorySlug: undefined,
              })}
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-[color:var(--brand-fg)]/70 underline-offset-4 hover:text-[color:var(--brand-primary)] hover:underline"
            >
              Limpiar
            </a>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function Selector({
  id,
  name,
  label,
  vacío,
  valor,
  opciones,
}: {
  id: string;
  name: string;
  label: string;
  vacío: string;
  valor: string | undefined;
  opciones: PublicTaxonomy[];
}) {
  if (opciones.length === 0) return null;
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={valor ?? ""}
        className="min-h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-3 text-sm text-[color:var(--brand-fg)] focus:border-[color:var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]/30"
      >
        <option value="">{vacío}</option>
        {opciones.map((opcion) => (
          <option key={opcion.slug} value={opcion.slug}>
            {opcion.name} ({opcion.productCount})
          </option>
        ))}
      </select>
    </div>
  );
}
