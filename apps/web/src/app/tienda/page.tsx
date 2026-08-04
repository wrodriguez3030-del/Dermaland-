import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackageSearch } from "lucide-react";
import {
  buildCatalogHref,
  hasActiveFilters,
  parseCatalogParams,
  type RawSearchParams,
} from "@/features/storefront/catalog-params";
import {
  DEFAULT_PAGE_SIZE,
  queryCatalog,
} from "@/features/storefront/catalog-query";
import { CatalogFilters } from "@/features/storefront/components/catalog-filters";
import { CatalogPagination } from "@/features/storefront/components/catalog-pagination";
import { ProductCard } from "@/features/storefront/components/product-card";
import { whatsappLink } from "@/features/storefront/contact";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * Catálogo público.
 *
 * El catálogo entero se carga UNA vez (cacheado) y la búsqueda, los filtros y el
 * orden se resuelven en memoria con `queryCatalog`, una función pura probada sin
 * base de datos. Es lo que permite que quien teclea "avene" encuentre "AVÈNE"
 * sin instalar `unaccent`/`pg_trgm` ni añadir columnas a `products`, la tabla de
 * la que dependen POS, DGII e inventario. El umbral para cambiar de estrategia
 * (~5 000 productos publicados) está escrito en `docs/tienda-en-linea.md` §3.5.
 */

/** Primera página cargada de inmediato: son las fotos que se ven sin bajar. */
const FOTOS_PRIORITARIAS = 4;

export const metadata: Metadata = {
  title: "Catálogo",
};

export default async function TiendaPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // `searchParams` se lee ANTES de cualquier otra cosa a propósito. Si el primer
  // `await` fuera el del tenant, con la tienda apagada la página llamaría a
  // `notFound()` sin haber tocado nunca la barra de dirección, y Next la
  // prerrenderizaría como una ruta ESTÁTICA en el build: al encender la tienda
  // seguiría sirviendo el 404 congelado. Leerlo primero deja constancia de que
  // esta página depende de la URL y siempre se renderiza en caliente.
  const params = await searchParams;
  const query = parseCatalogParams(params);

  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  const { products, brands, categories } = await loadPublishedCatalog(
    tenant.businessId,
  );
  const resultado = queryCatalog(products, {
    ...query,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const filtrado = hasActiveFilters(query);
  const whatsapp = whatsappLink(
    tenant.whatsappPhone,
    query.q ? `Hola, estoy buscando: ${query.q}` : undefined,
  );

  return (
    <>
      <section className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)] sm:text-3xl">
          {filtrado ? "Resultados" : "Catálogo"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--brand-fg)]/70">
          {tenant.tagline ??
            "Dermocosmética y cuidado de la piel, con asesoría de nuestro equipo."}
        </p>
      </section>

      <CatalogFilters query={query} brands={brands} categories={categories} />

      {resultado.usedFuzzy ? (
        // La búsqueda solo tolera erratas cuando no hubo ninguna coincidencia
        // exacta. Decirlo evita que el cliente crea que le enseñamos otra cosa
        // por error.
        <p className="mt-4 rounded-xl bg-[color:var(--brand-warn)]/10 px-4 py-3 text-sm text-[color:var(--brand-fg)]/80">
          No encontramos exactamente <strong>«{query.q}»</strong>. Estos son los
          resultados más parecidos.
        </p>
      ) : null}

      <p
        className="mt-6 text-sm text-[color:var(--brand-fg)]/60"
        aria-live="polite"
      >
        {resultado.total === 0
          ? "Ningún producto coincide"
          : resultado.total === 1
            ? "1 producto"
            : `${resultado.total} productos`}
      </p>

      {resultado.items.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {resultado.items.map((producto, indice) => (
            <li key={producto.slug} className="h-full">
              <ProductCard
                product={producto}
                priority={indice < FOTOS_PRIORITARIAS}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center">
          <PackageSearch
            aria-hidden
            className="mx-auto h-10 w-10 text-[color:var(--brand-fg)]/30"
          />
          <p className="mt-4 font-semibold text-[color:var(--brand-fg)]">
            No encontramos productos con esos filtros
          </p>
          <p className="mt-1 text-sm text-[color:var(--brand-fg)]/60">
            Prueba con menos filtros, o escríbenos y te ayudamos a buscarlo.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {filtrado ? (
              <a
                href={buildCatalogHref(query, {
                  q: undefined,
                  brandSlug: undefined,
                  categorySlug: undefined,
                })}
                className="inline-flex min-h-11 items-center rounded-xl border border-black/10 bg-white px-5 text-sm font-medium text-[color:var(--brand-fg)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--brand-primary)]"
              >
                Ver todo el catálogo
              </a>
            ) : null}
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-xl bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)]"
              >
                Preguntar por WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      )}

      <CatalogPagination query={query} result={resultado} />
    </>
  );
}
