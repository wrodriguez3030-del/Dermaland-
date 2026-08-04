// Datos estructurados (JSON-LD) de la tienda.
//
// Es lo que hace que un producto aparezca en Google con su precio y su
// disponibilidad en vez de como un enlace azul más. Va aparte y como función
// pura por dos motivos: se puede probar sin navegador, y el escapado —lo único
// peligroso de todo esto— queda en UN sitio.
//
// El peligro: el JSON se incrusta dentro de un `<script>`. Un nombre de
// producto que contuviera `</script>` cerraría la etiqueta y lo que viniera
// detrás lo ejecutaría el navegador como código. Los nombres salen de la base,
// que edita el personal del negocio: no es un atacante remoto, pero tampoco hace
// falta confiar en que nadie pegue nunca algo raro en un campo de texto.

import type { PublicProduct, StorefrontTenant } from "./types";

/** Moneda ISO. La tienda solo vende en pesos dominicanos. */
const MONEDA = "DOP";

/** Vocabulario de schema.org para la disponibilidad. */
const DISPONIBILIDAD = {
  in_stock: "https://schema.org/InStock",
  out_of_stock: "https://schema.org/OutOfStock",
} as const;

/**
 * Serializa para incrustar dentro de `<script type="application/ld+json">`.
 *
 * Escapa `<` como `<`: es JSON válido, lo entiende cualquier consumidor y
 * hace imposible cerrar la etiqueta desde el contenido.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Ficha de producto en el vocabulario de schema.org. */
export function productJsonLd(
  product: PublicProduct,
  tenant: StorefrontTenant,
  baseUrl: string,
): Record<string, unknown> {
  const url = `${baseUrl}/tienda/producto/${product.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    ...(product.description || product.summary
      ? { description: product.description ?? product.summary }
      : {}),
    ...(product.imageUrl ? { image: [product.imageUrl] } : {}),
    ...(product.brandName
      ? { brand: { "@type": "Brand", name: product.brandName } }
      : {}),
    url,
    offers: {
      "@type": "Offer",
      url,
      // Dos decimales sin separador de miles: schema.org espera un número, no
      // el "RD$1,880.00" que ve la persona.
      price: product.price.toFixed(2),
      priceCurrency: MONEDA,
      availability: DISPONIBILIDAD[product.availability.status],
      seller: { "@type": "Organization", name: tenant.siteName },
    },
  };
}

/** Migas de pan para el buscador; las mismas que ve la persona. */
export function breadcrumbJsonLd(
  product: PublicProduct,
  baseUrl: string,
): Record<string, unknown> {
  const items: { name: string; url: string }[] = [
    { name: "Catálogo", url: `${baseUrl}/tienda` },
  ];
  if (product.categoryName && product.categorySlug) {
    items.push({
      name: product.categoryName,
      url: `${baseUrl}/tienda?categoria=${encodeURIComponent(product.categorySlug)}`,
    });
  }
  items.push({
    name: product.title,
    url: `${baseUrl}/tienda/producto/${product.slug}`,
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, indice) => ({
      "@type": "ListItem",
      position: indice + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** La tienda como negocio local, con sus sucursales. */
export function storeJsonLd(
  tenant: StorefrontTenant,
  baseUrl: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: tenant.siteName,
    url: `${baseUrl}/tienda`,
    ...(tenant.seoDescription || tenant.tagline
      ? { description: tenant.seoDescription ?? tenant.tagline }
      : {}),
    ...(tenant.contactEmail ? { email: tenant.contactEmail } : {}),
    ...(tenant.whatsappPhone ? { telephone: tenant.whatsappPhone } : {}),
    location: tenant.branches.map((sucursal) => ({
      "@type": "Place",
      name: sucursal.name,
      ...(sucursal.address || sucursal.city
        ? {
            address: {
              "@type": "PostalAddress",
              ...(sucursal.address ? { streetAddress: sucursal.address } : {}),
              ...(sucursal.city ? { addressLocality: sucursal.city } : {}),
              addressCountry: "DO",
            },
          }
        : {}),
      ...(sucursal.phone ? { telephone: sucursal.phone } : {}),
    })),
  };
}
