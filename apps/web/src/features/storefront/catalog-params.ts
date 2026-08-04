// Traducción entre la URL pública y `CatalogQuery`.
//
// Los parámetros van en español (`?q=&marca=&categoria=&orden=&pagina=`) porque
// son parte de lo que el cliente ve, copia y comparte por WhatsApp — y esta
// tienda es es-DO.
//
// Todo lo que entra por aquí lo escribe un desconocido: un enlace viejo, un
// rastreador probando combinaciones, alguien tecleando `pagina=-4` o
// `orden=DROP`. Nada de eso debe romper la página ni llegar a una consulta, así
// que el parseo es una función pura, total (siempre devuelve algo válido) y
// probada. Un `orden` desconocido cae a "relevancia"; una `pagina` absurda cae a
// la 1; `queryCatalog` ya ajusta las páginas por encima del máximo.

import { CATALOG_SORTS, type CatalogQuery, type CatalogSort } from "./types";

/** Nombres de los parámetros en la URL pública. */
export const CATALOG_PARAM = {
  q: "q",
  brand: "marca",
  category: "categoria",
  sort: "orden",
  page: "pagina",
} as const;

/**
 * Dónde vive la rejilla con filtros, búsqueda y paginación.
 *
 * `/tienda` es la PORTADA. Tenerlas en la misma dirección obligaba a que una
 * sola URL fuera dos páginas distintas según llevara o no parámetros, y eso se
 * nota donde importa: el H1, la canónica y la política de indexación no pueden
 * ser las mismas para una portada y para una página de resultados.
 */
export const CATALOG_BASE = "/tienda/catalogo";

/** Lo que entrega Next en `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Primer valor de un parámetro repetido (`?marca=a&marca=b` → "a"). */
function primero(valor: string | string[] | undefined): string | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  const limpio = texto?.trim();
  return limpio ? limpio : undefined;
}

function esOrdenValido(valor: string | undefined): valor is CatalogSort {
  return !!valor && (CATALOG_SORTS as readonly string[]).includes(valor);
}

/** Convierte la URL en una consulta válida. Nunca lanza. */
export function parseCatalogParams(raw: RawSearchParams): CatalogQuery {
  const pagina = Number.parseInt(primero(raw[CATALOG_PARAM.page]) ?? "", 10);
  const orden = primero(raw[CATALOG_PARAM.sort]);

  return {
    q: primero(raw[CATALOG_PARAM.q]),
    brandSlug: primero(raw[CATALOG_PARAM.brand]),
    categorySlug: primero(raw[CATALOG_PARAM.category]),
    sort: esOrdenValido(orden) ? orden : "relevancia",
    page: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

/** ¿Hay algún filtro puesto? Decide si se ofrece "Limpiar filtros". */
export function hasActiveFilters(query: CatalogQuery): boolean {
  return !!(query.q || query.brandSlug || query.categorySlug);
}

/**
 * Enlace del catálogo con los cambios aplicados.
 *
 * Cambiar de filtro devuelve SIEMPRE a la página 1: si alguien está en la
 * página 7 y elige una marca con 12 productos, conservar la página lo dejaría
 * mirando una lista vacía. Solo el cambio explícito de `page` la conserva.
 *
 * Los parámetros en su valor por defecto no se escriben: la URL que se comparte
 * debe ser `/tienda?marca=avene`, no `/tienda?q=&marca=avene&orden=relevancia&pagina=1`.
 */
export function buildCatalogHref(
  query: CatalogQuery,
  cambios: Partial<CatalogQuery> = {},
  base = CATALOG_BASE,
): string {
  const cambiaFiltro =
    "q" in cambios || "brandSlug" in cambios || "categorySlug" in cambios || "sort" in cambios;
  const siguiente: CatalogQuery = {
    ...query,
    ...cambios,
    page: "page" in cambios ? cambios.page : cambiaFiltro ? 1 : query.page,
  };

  const params = new URLSearchParams();
  if (siguiente.q) params.set(CATALOG_PARAM.q, siguiente.q);
  if (siguiente.brandSlug) params.set(CATALOG_PARAM.brand, siguiente.brandSlug);
  if (siguiente.categorySlug) params.set(CATALOG_PARAM.category, siguiente.categorySlug);
  if (siguiente.sort && siguiente.sort !== "relevancia") {
    params.set(CATALOG_PARAM.sort, siguiente.sort);
  }
  if (siguiente.page && siguiente.page > 1) {
    params.set(CATALOG_PARAM.page, String(siguiente.page));
  }

  const cadena = params.toString();
  return cadena ? `${base}?${cadena}` : base;
}

/**
 * Dirección de una categoría.
 *
 * Una categoría es una PÁGINA, no un filtro: tiene su propio H1, su propia
 * canónica y su sitio en el sitemap. Un `?categoria=solares` es invisible para
 * un buscador; esto no.
 *
 * `encodeURIComponent` porque el slug se deriva de un nombre escrito por una
 * persona: aunque `slugify` lo limpie, esta función también la llaman las
 * pruebas y el sitemap con lo que haya en la base.
 */
export function categoryHref(slug: string): string {
  return `/tienda/categoria/${encodeURIComponent(slug)}`;
}

/** Etiquetas de los órdenes, de cara al cliente. */
export const SORT_LABELS: Record<CatalogSort, string> = {
  relevancia: "Más relevantes",
  nombre: "Nombre (A-Z)",
  "precio-asc": "Precio: de menor a mayor",
  "precio-desc": "Precio: de mayor a menor",
  nuevos: "Novedades",
};
