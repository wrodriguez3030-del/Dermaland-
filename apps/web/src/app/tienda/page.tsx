import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  buildCatalogHref,
  parseCatalogParams,
  type RawSearchParams,
} from "@/features/storefront/catalog-params";
import { ProductShelf } from "@/features/storefront/components/product-shelf";
import { SearchBox } from "@/features/storefront/components/search-box";
import { buildHomeSections } from "@/features/storefront/home-sections";
import {
  serializeJsonLd,
  storeJsonLd,
} from "@/features/storefront/structured-data";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
import {
  resolveStorefrontTenant,
  storefrontBaseUrl,
} from "@/server/services/storefront/tenant";

/**
 * Portada de la tienda.
 *
 * Ya no es una rejilla de 24 tarjetas iguales: es una portada con estantes por
 * sección, para que quien llega entienda de un vistazo qué se vende aquí. La
 * rejilla con filtros, orden y paginación vive en `/tienda/catalogo`.
 *
 * `searchParams` se lee ANTES de nada a propósito. Si el primer `await` fuera el
 * del negocio, con la tienda apagada la página llamaría a `notFound()` sin haber
 * tocado la barra de dirección, y Next la prerrenderizaría como ruta ESTÁTICA en
 * el build: al encender la tienda seguiría sirviendo ese 404 congelado.
 */

export const metadata: Metadata = {
  title: "Inicio",
  alternates: { canonical: "/tienda" },
};

export default async function TiendaPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;

  // Los enlaces viejos —los que ya se compartieron por WhatsApp con `?q=` o
  // `?marca=`— siguen funcionando: se mandan a la rejilla con sus filtros
  // puestos, en vez de caer en una portada que los ignora en silencio.
  const query = parseCatalogParams(params);
  if (query.q || query.brandSlug || query.categorySlug) {
    redirect(buildCatalogHref(query));
  }

  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  const { products, categories } = await loadPublishedCatalog(tenant.businessId);
  const secciones = buildHomeSections(products, categories);

  return (
    <>
      {/* La tienda como negocio local, con sus sucursales: es lo que permite
          que Google enseñe dirección y teléfono junto al resultado. Va en la
          portada y solo aquí, para no repetir la misma ficha en cada página. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(storeJsonLd(tenant, storefrontBaseUrl())),
        }}
      />

      <section className="rounded-3xl bg-gradient-to-br from-[color:var(--brand-primary)]/10 via-white to-[color:var(--brand-accent)]/5 px-6 py-10 sm:px-10 sm:py-14">
        <h1 className="max-w-2xl text-2xl font-bold leading-tight tracking-tight text-[color:var(--brand-fg)] sm:text-4xl">
          {tenant.tagline ??
            "Dermocosmética y cuidado de la piel, con asesoría de nuestro equipo."}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-[color:var(--brand-fg)]/70 sm:text-base">
          Busca por producto o por marca, o baja y mira lo que tenemos por
          categoría.
        </p>
        <SearchBox id="buscador-portada" className="mt-6 max-w-lg" />
      </section>

      {secciones.length > 0 ? (
        <div className="mt-12">
          {secciones.map((seccion, indice) => (
            <ProductShelf
              key={seccion.key}
              section={seccion}
              priority={indice === 0}
            />
          ))}
        </div>
      ) : (
        // La tienda encendida pero sin nada publicado NO es un error: es el
        // estado normal el día antes del lanzamiento.
        <p className="mt-12 rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center text-sm text-[color:var(--brand-fg)]/60">
          Estamos preparando el catálogo. Vuelve en un rato.
        </p>
      )}

      <p className="mt-14 text-center">
        <Link
          href={buildCatalogHref({})}
          className="inline-flex min-h-12 items-center rounded-xl border border-black/10 bg-white px-6 text-sm font-semibold text-[color:var(--brand-primary)] hover:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
        >
          Ver todo el catálogo
        </Link>
      </p>
    </>
  );
}
