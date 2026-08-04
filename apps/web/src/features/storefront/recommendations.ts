// Qué se le enseña a alguien que ya está mirando un producto.
//
// El negocio lo pidió así: "productos recomendados por categoría". Por eso la
// categoría manda sobre la marca, al revés de lo que hacía la ficha antes.
//
// Función pura y sin reloj ni azar A PROPÓSITO: el catálogo va cacheado cinco
// minutos, así que un orden aleatorio serviría estantes distintos a cada
// visitante según a quién le tocara refrescar la caché. Determinista, la página
// se ve igual para todos y las pruebas valen algo.
//
// `product_web_meta.related_product_ids` existe en la base para una capa manual
// —"recomienda TÚ estos tres"— pero hoy ningún código la escribe: el admin de
// catálogo web no edita ese campo. Cuando exista ese camino de escritura, entra
// aquí como primer criterio, por delante de la afinidad automática.

import type { PublicProduct } from "./types";

/** Cuántos recomendados se muestran cuando nadie dice otra cosa. */
export const RECOMMENDATION_LIMIT = 8;

export interface RecommendationOptions {
  limit?: number;
}

/**
 * Un candidato debe poder comprarse HOY y verse bien.
 *
 * Sin foto queda fuera: un estante de marcadores grises lee como tienda
 * descuidada, y aquí el marcador no es un fallo sino lo normal en 704 de los
 * 1 355 productos (R-WEB-05).
 */
function esCandidato(p: PublicProduct, actual: PublicProduct): boolean {
  return (
    p.slug !== actual.slug &&
    p.availability.status === "in_stock" &&
    p.imageUrl !== null
  );
}

/** Cuanto más alto, más arriba. Categoría pesa más que marca. */
function afinidad(p: PublicProduct, actual: PublicProduct): number {
  let total = 0;
  if (actual.categorySlug && p.categorySlug === actual.categorySlug) total += 10;
  if (actual.brandSlug && p.brandSlug === actual.brandSlug) total += 4;
  return total;
}

function desempatar(a: PublicProduct, b: PublicProduct): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
  return a.title.localeCompare(b.title, "es");
}

export function recommendFor(
  product: PublicProduct,
  catalog: readonly PublicProduct[],
  options: RecommendationOptions = {},
): PublicProduct[] {
  const limite = Math.max(0, options.limit ?? RECOMMENDATION_LIMIT);

  return catalog
    .filter((p) => esCandidato(p, product) && afinidad(p, product) > 0)
    .sort(
      (a, b) => afinidad(b, product) - afinidad(a, product) || desempatar(a, b),
    )
    .slice(0, limite);
}
