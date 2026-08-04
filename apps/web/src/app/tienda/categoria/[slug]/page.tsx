import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  buildCatalogHref,
  categoryHref,
  parseCatalogParams,
  type RawSearchParams,
} from "@/features/storefront/catalog-params";
import {
  DEFAULT_PAGE_SIZE,
  queryCatalog,
} from "@/features/storefront/catalog-query";
import { CatalogPagination } from "@/features/storefront/components/catalog-pagination";
import { ProductCard } from "@/features/storefront/components/product-card";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * Colección de una categoría.
 *
 * Es una PÁGINA, no un filtro: título propio, canónica propia y sitio en el
 * sitemap. Un `?categoria=solares` es invisible para un buscador; esto no.
 *
 * Igual que en `/tienda`, `searchParams` se lee antes que nada: si el primer
 * `await` fuera el del negocio, con la tienda apagada Next concluiría que la
 * página no depende de la URL y congelaría el 404 en el build.
 */

/** Fotos que se cargan de inmediato: las que se ven sin bajar. */
const FOTOS_PRIORITARIAS = 4;

async function cargar(slug: string) {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) return null;
  const { products, categories } = await loadPublishedCatalog(tenant.businessId);
  // La categoría se busca en la MISMA lista que alimenta el catálogo, así que
  // una categoría sin productos publicados sencillamente no existe: 404 en vez
  // de una página vacía con un H1 prometiendo algo que no está.
  const categoria = categories.find((c) => c.slug === slug);
  if (!categoria) return null;
  return { tenant, categoria, products };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const datos = await cargar(slug);
  if (!datos)
    return { title: "Categoría no disponible", robots: { index: false } };

  const { categoria, tenant } = datos;
  return {
    title: categoria.name,
    description: `${categoria.name} en ${tenant.siteName}. ${categoria.productCount} productos disponibles.`,
    // Las colecciones SÍ se indexan: son estables y reales, al revés que una
    // página de resultados de búsqueda.
    alternates: { canonical: `/tienda/categoria/${categoria.slug}` },
  };
}

export default async function CategoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseCatalogParams(await searchParams);
  const { slug } = await params;
  const datos = await cargar(slug);
  if (!datos) notFound();
  const { categoria, products } = datos;

  // El texto libre se ignora aquí a propósito: buscar dentro de una categoría es
  // otra intención, y la rejilla ya la resuelve con todos sus filtros.
  const resultado = queryCatalog(products, {
    ...query,
    q: undefined,
    categorySlug: categoria.slug,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <>
      <nav aria-label="Ruta de navegación" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-[color:var(--brand-fg)]/60">
          <li>
            <Link
              href="/tienda"
              className="underline-offset-4 hover:text-[color:var(--brand-primary)] hover:underline"
            >
              Tienda
            </Link>
          </li>
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
          <li aria-current="page" className="text-[color:var(--brand-fg)]">
            {categoria.name}
          </li>
        </ol>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)] sm:text-3xl">
        {categoria.name}
      </h1>
      <p className="mt-2 text-sm text-[color:var(--brand-fg)]/60">
        {resultado.total === 1 ? "1 producto" : `${resultado.total} productos`}
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {resultado.items.map((producto, indice) => (
          <li key={producto.slug} className="h-full">
            <ProductCard
              product={producto}
              priority={indice < FOTOS_PRIORITARIAS}
            />
          </li>
        ))}
      </ul>

      {/* La paginación se queda DENTRO de la categoría. Sin `base` construiría
          `/tienda/catalogo?categoria=…&pagina=2` y echaría al visitante —y al
          rastreador— fuera de la página que acaba de encontrar. */}
      <CatalogPagination
        query={{ ...query, q: undefined, categorySlug: undefined }}
        result={resultado}
        base={categoryHref(categoria.slug)}
      />

      <p className="mt-10 text-center">
        <Link
          href={buildCatalogHref({})}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
        >
          Ver todo el catálogo
        </Link>
      </p>
    </>
  );
}
