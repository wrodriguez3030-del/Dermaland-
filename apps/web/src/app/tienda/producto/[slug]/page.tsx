import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronRight, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  buildCatalogHref,
  categoryHref,
} from "@/features/storefront/catalog-params";
import { AddToCartButton } from "@/features/storefront/components/add-to-cart-button";
import { productBlurb } from "@/features/storefront/product-blurb";
import { ProductCard } from "@/features/storefront/components/product-card";
import { ProductPhoto } from "@/features/storefront/components/product-photo";
import {
  productInquiryMessage,
  whatsappLink,
} from "@/features/storefront/contact";
import { recommendFor } from "@/features/storefront/recommendations";
import {
  breadcrumbJsonLd,
  productJsonLd,
  serializeJsonLd,
} from "@/features/storefront/structured-data";
import type { PublicProduct } from "@/features/storefront/types";
import { formatCurrency } from "@/lib/utils/format";
import {
  findPublishedProduct,
  loadPublishedCatalog,
} from "@/server/services/storefront/catalog";
import {
  resolveStorefrontTenant,
  storefrontBaseUrl,
} from "@/server/services/storefront/tenant";

/**
 * Ficha de producto.
 *
 * No hay carrito todavía: el cierre de la venta ocurre por WhatsApp o en la
 * sucursal, así que el botón de WhatsApp —con el producto y su enlace ya
 * escritos en el mensaje— es la acción principal de esta página.
 *
 * Un producto que dejó de ser publicable (se desactivó, se quedó sin precio,
 * perdió la foto) devuelve 404 y no una ficha a medias: se resuelve contra el
 * MISMO catálogo que alimenta la lista, así que la ficha nunca puede enseñar
 * algo que el catálogo ya no considera publicado.
 */

/** Cuántos productos relacionados se muestran. */
const RELACIONADOS = 4;

async function cargarFicha(slug: string) {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) return null;
  const producto = await findPublishedProduct(tenant.businessId, slug);
  if (!producto) return null;
  return { tenant, producto };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ficha = await cargarFicha(slug);
  if (!ficha)
    return { title: "Producto no disponible", robots: { index: false } };

  const { producto } = ficha;
  const titulo = producto.seoTitle ?? producto.title;
  const descripcion =
    producto.seoDescription ??
    producto.summary ??
    [producto.brandName, producto.title, producto.presentation]
      .filter(Boolean)
      .join(" · ");

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `/tienda/producto/${producto.slug}` },
    openGraph: {
      type: "website",
      title: titulo,
      description: descripcion,
      url: `/tienda/producto/${producto.slug}`,
      ...(producto.imageUrl ? { images: [{ url: producto.imageUrl }] } : {}),
    },
  };
}

export default async function ProductoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ficha = await cargarFicha(slug);
  if (!ficha) notFound();
  const { tenant, producto } = ficha;

  const agotado = producto.availability.status === "out_of_stock";
  const resumen = productBlurb(producto);
  const url = `${storefrontBaseUrl()}/tienda/producto/${producto.slug}`;
  const whatsapp = whatsappLink(
    tenant.whatsappPhone,
    productInquiryMessage(producto.title, url),
  );
  // Mismo catálogo cacheado que sirvió la ficha: `cache()` de React lo comparte
  // dentro de la petición, así que recomendar no cuesta un viaje más a la base.
  const { products: catalogo } = await loadPublishedCatalog(tenant.businessId);
  const relacionados = recommendFor(producto, catalogo, {
    limit: RELACIONADOS,
  });

  return (
    <>
      {/* Datos estructurados: precio y disponibilidad directamente en el
          resultado de Google. El contenido va escapado — un nombre con
          `</script>` cerraría la etiqueta. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            productJsonLd(producto, tenant, storefrontBaseUrl()),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbJsonLd(producto, storefrontBaseUrl()),
          ),
        }}
      />

      <Migas producto={producto} />

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <ProductPhoto
            src={producto.imageUrl}
            alt={producto.imageAlt}
            title={producto.title}
            priority
          />
        </div>

        <div>
          {producto.brandName ? (
            <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-primary)]">
              {producto.brandSlug ? (
                <Link
                  href={buildCatalogHref({}, { brandSlug: producto.brandSlug })}
                  className="underline-offset-4 hover:underline"
                >
                  {producto.brandName}
                </Link>
              ) : (
                producto.brandName
              )}
            </p>
          ) : null}

          <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-[color:var(--brand-fg)] sm:text-3xl">
            {producto.title}
          </h1>

          {producto.presentation ? (
            <p className="mt-2 text-sm text-[color:var(--brand-fg)]/60">
              {producto.presentation}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <p className="text-3xl font-bold text-[color:var(--brand-fg)]">
              {formatCurrency(producto.price)}
            </p>
            {/* Mismo Badge del ERP que la tarjeta del catálogo: su verde llega
                a AA en texto pequeño; `--brand-success` no. */}
            <Badge tone={agotado ? "neutral" : "success"}>
              {producto.availability.label}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[color:var(--brand-fg)]/50">
            Precio con ITBIS incluido
          </p>

          {/* Qué es y para qué piel. Sale del texto del negocio si lo escribió
              y, si no, de lo que dice el propio nombre del producto — el
              catálogo no tiene ni una descripción redactada. */}
          {resumen.summary ? (
            <p className="mt-6 text-base leading-relaxed text-[color:var(--brand-fg)]/80">
              {resumen.summary}
            </p>
          ) : null}

          {resumen.skinTypes.length > 0 ? (
            <div className="mt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
                Indicado para
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {resumen.skinTypes.map((tipo) => (
                  <li
                    key={tipo}
                    className="rounded-full bg-[color:var(--brand-primary)]/10 px-3 py-1 text-sm font-medium text-[color:var(--brand-primary)]"
                  >
                    {tipo}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Agregar al carrito es la acción principal; WhatsApp pasa a ser la
              secundaria (contorno, no relleno) pero no desaparece: hay clientes
              que prefieren preguntar antes de comprar. Lo agotado no se puede
              agregar, así que ahí WhatsApp vuelve a ser lo único. */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {!agotado ? <AddToCartButton slug={producto.slug} /> : null}
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--brand-primary)] px-6 text-base font-semibold text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--brand-primary)]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2 sm:w-auto"
              >
                <MessageCircle aria-hidden className="h-5 w-5" />
                {agotado ? "Consultar disponibilidad" : "Preguntar por WhatsApp"}
              </a>
            ) : null}
          </div>

          <p className="mt-3 text-sm text-[color:var(--brand-fg)]/60">
            {agotado
              ? "Ahora mismo no tenemos existencias. Escríbenos y te avisamos cuando llegue."
              : "Retiras tu pedido en la sucursal que elijas y pagas al recogerlo."}
          </p>

          {producto.benefits.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
                Beneficios
              </h2>
              <ul className="mt-3 space-y-2">
                {producto.benefits.map((beneficio) => (
                  <li
                    key={beneficio}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Check
                      aria-hidden
                      className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand-success)]"
                    />
                    <span className="text-[color:var(--brand-fg)]/80">
                      {beneficio}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      {producto.description || producto.howToUse ? (
        <div className="mt-12 grid gap-8 border-t border-black/5 pt-10 md:grid-cols-2">
          {producto.description ? (
            <section>
              <h2 className="text-lg font-semibold text-[color:var(--brand-fg)]">
                Descripción
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[color:var(--brand-fg)]/80">
                {producto.description}
              </p>
            </section>
          ) : null}
          {producto.howToUse ? (
            <section>
              <h2 className="text-lg font-semibold text-[color:var(--brand-fg)]">
                Modo de uso
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[color:var(--brand-fg)]/80">
                {producto.howToUse}
              </p>
            </section>
          ) : null}
        </div>
      ) : null}

      {relacionados.length > 0 ? (
        <section className="mt-14 border-t border-black/5 pt-10">
          <h2 className="text-lg font-semibold text-[color:var(--brand-fg)]">
            También te puede interesar
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {relacionados.map((otro) => (
              <li key={otro.slug} className="h-full">
                <ProductCard product={otro} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Migas de pan: dónde estoy y cómo vuelvo. */
function Migas({ producto }: { producto: PublicProduct }) {
  return (
    <nav aria-label="Ruta de navegación" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-[color:var(--brand-fg)]/60">
        <li>
          <Link
            href="/tienda"
            className="underline-offset-4 hover:text-[color:var(--brand-primary)] hover:underline"
          >
            Catálogo
          </Link>
        </li>
        {producto.categoryName && producto.categorySlug ? (
          <>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
            <li>
              <Link
                href={categoryHref(producto.categorySlug)}
                className="underline-offset-4 hover:text-[color:var(--brand-primary)] hover:underline"
              >
                {producto.categoryName}
              </Link>
            </li>
          </>
        ) : null}
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
        <li
          aria-current="page"
          className="max-w-full truncate text-[color:var(--brand-fg)]"
        >
          {producto.title}
        </li>
      </ol>
    </nav>
  );
}
