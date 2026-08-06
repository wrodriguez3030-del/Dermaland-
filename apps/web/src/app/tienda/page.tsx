import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import {
  buildCatalogHref,
  parseCatalogParams,
  type RawSearchParams,
} from "@/features/storefront/catalog-params";
import { ProductShelf } from "@/features/storefront/components/product-shelf";
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
  // Se cuenta lo que se puede comprar HOY, no el catálogo entero: prometer 638
  // productos y que la mitad esté agotada es peor que no prometer nada.
  const productosDisponibles = products.filter(
    (p) => p.availability.status === "in_stock",
  ).length;

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

      {/* Sin buscador aquí: el del encabezado es fijo y se ve en todo momento,
          así que uno más a cuatro dedos de distancia solo parece un descuido. */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[color:var(--brand-primary)] to-[color:var(--brand-accent)] px-6 py-10 text-white sm:px-10 sm:py-12">
        <h1 className="max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
          {tenant.tagline ??
            "Dermocosmética y cuidado de la piel, con asesoría de nuestro equipo."}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-white/80 sm:text-base">
          {productosDisponibles > 0
            ? `${productosDisponibles.toLocaleString("es-DO")} productos disponibles hoy.`
            : "Explora nuestro catálogo."}{" "}
          Te asesoramos por WhatsApp y coordinamos la entrega o el retiro en
          sucursal.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href={buildCatalogHref({})}
            className="inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-sm font-semibold text-[color:var(--brand-primary)] transition-colors hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-primary)]"
          >
            Ver todo el catálogo
          </Link>
          {/* Dos tiendas físicas es lo que distingue a este negocio de una web
              cualquiera. Se dice arriba, no escondido en el pie.

              Cada sucursal lleva SU propio pin. Antes se unían con " · " y el
              resultado ("Cutis · E. León Jiménez") se leía como el nombre de un
              solo local, así que la segunda tienda desaparecía de hecho. */}
          {tenant.branches.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/80">
              {tenant.branches.map((s) => (
                <li key={s.name} className="flex items-center gap-1.5">
                  <MapPin aria-hidden className="h-4 w-4 shrink-0" />
                  {s.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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
