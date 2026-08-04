import type { MetadataRoute } from "next";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
import {
  resolveStorefrontTenant,
  storefrontBaseUrl,
} from "@/server/services/storefront/tenant";

/**
 * Mapa del sitio.
 *
 * Solo lista la tienda: el resto de la aplicación está tras sesión y no tiene
 * nada que hacer en un buscador. Con la tienda apagada devuelve una lista vacía
 * —un sitemap sin URLs, no un error— porque un 500 aquí haría que el buscador
 * reintentara y acabara marcando el sitio como problemático.
 *
 * Las URLs salen del MISMO catálogo que sirve las páginas, así que el sitemap no
 * puede prometer un producto que la tienda ya no publica.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) return [];

  const base = storefrontBaseUrl();
  const { products } = await loadPublishedCatalog(tenant.businessId);

  return [
    {
      url: `${base}/tienda`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/tienda/catalogo`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...products.map((producto) => ({
      url: `${base}/tienda/producto/${producto.slug}`,
      changeFrequency: "weekly" as const,
      // Lo agotado se lista igual —informa y posiciona— pero con menos
      // prioridad que lo que se puede comprar hoy.
      priority: producto.availability.status === "in_stock" ? 0.8 : 0.5,
    })),
  ];
}
