// Búsqueda, filtros, orden y paginación del catálogo público. TODO en memoria.
//
// Por qué en memoria y no en la base:
//
// Con ILIKE, quien teclea "avene" NO encuentra "AVÈNE" — y media clientela
// escribe sin acentos. Resolverlo en Postgres exige instalar `unaccent` y
// `pg_trgm` (hoy no instaladas) y añadir una columna generada a `products`, la
// tabla que usan POS, DGII e inventario. Es tocar el núcleo del ERP por una
// función de marketing.
//
// El catálogo publicado son cientos de filas, no millones: se carga una vez,
// cacheado, y se consulta aquí. A cambio se gana insensibilidad a acentos y
// mayúsculas, búsqueda sobre varios campos a la vez, tolerancia a erratas, y una
// función pura que se prueba entera sin base de datos.
//
// Umbral de salida documentado: si el catálogo publicado supera ~5 000 productos
// o el payload cacheado ~1 MB, se pasa a búsqueda en base con la migración 0037
// (`unaccent` + `pg_trgm` + columna generada + índice GIN). Ver
// `docs/tienda-en-linea.md`.
//
// Nota de alcance: aquí NO se decide qué es publicable. Los filtros duros
// (activo, vendible, precio > 0, sin receta, no controlado, visible en web) se
// aplican en el servidor, en `server/services/storefront/catalog.ts`, antes de
// construir el `PublicProduct`. Este módulo solo consulta lo ya publicado.

import type { CatalogQuery, CatalogResult, PublicProduct } from "./types";

/** Tamaño de página por defecto: 4 columnas × 6 filas en escritorio. */
export const DEFAULT_PAGE_SIZE = 24;

/** Menos de 2 caracteres no filtra: devolvería medio catálogo por azar. */
const MIN_QUERY_CHARS = 2;

/** Sin acentos, en minúsculas y con espacios colapsados. */
export function normalizeForSearch(input: string): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿`a` y `b` se diferencian como mucho en una edición (inserción, omisión o
 * sustitución)? Recorrido lineal, sin matriz: para tolerar UNA errata no hace
 * falta Levenshtein completo.
 */
export function isWithinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  if (larga.length - corta.length > 1) return false;

  let i = 0;
  let j = 0;
  let diferencias = 0;
  while (i < corta.length && j < larga.length) {
    if (corta[i] === larga[j]) {
      i++;
      j++;
      continue;
    }
    if (++diferencias > 1) return false;
    // Misma longitud → sustitución (avanzan ambos). Distinta → omisión en la
    // corta (avanza solo la larga).
    if (corta.length === larga.length) i++;
    j++;
  }
  // Lo que sobre al final de la larga cuenta como la única edición pendiente.
  return diferencias + (larga.length - j) + (corta.length - i) <= 1;
}

/** Texto sobre el que se busca un producto. Se calcula una vez por consulta. */
function haystack(p: PublicProduct): string {
  return normalizeForSearch(
    [p.title, p.summary, p.brandName, p.categoryName, p.presentation]
      .filter(Boolean)
      .join(" "),
  );
}

/** ¿El texto contiene el token, tolerando una errata si se pide? */
function tokenMatches(texto: string, token: string, fuzzy: boolean): boolean {
  if (texto.includes(token)) return true;
  if (!fuzzy) return false;
  // Comparar palabra a palabra: tolerar una errata sobre la cadena entera
  // convertiría cualquier consulta corta en un comodín.
  return texto.split(" ").some((palabra) => isWithinOneEdit(palabra, token));
}

/**
 * Puntuación de relevancia. Prioriza el título sobre la marca y la marca sobre
 * la categoría, y hunde lo agotado: enseñar primero lo que no se puede comprar
 * es la forma más rápida de perder una venta.
 */
function score(p: PublicProduct, tokens: string[]): number {
  const titulo = normalizeForSearch(p.title);
  const marca = normalizeForSearch(p.brandName ?? "");
  let total = 0;

  for (const token of tokens) {
    if (titulo.startsWith(token)) total += 100;
    else if (titulo.includes(token)) total += 50;
    if (marca.includes(token)) total += 30;
  }
  if (p.featured) total += 8;
  if (p.isNew) total += 4;
  if (p.availability.status === "out_of_stock") total -= 200;
  return total;
}

function comparar(a: PublicProduct, b: PublicProduct, sort: CatalogQuery["sort"], tokens: string[]): number {
  switch (sort) {
    case "nombre":
      return a.title.localeCompare(b.title, "es");
    case "precio-asc":
      return a.price - b.price;
    case "precio-desc":
      return b.price - a.price;
    case "nuevos":
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return a.title.localeCompare(b.title, "es");
    default: {
      const d = score(b, tokens) - score(a, tokens);
      return d !== 0 ? d : a.title.localeCompare(b.title, "es");
    }
  }
}

/**
 * Consulta el catálogo ya publicado. Función pura: mismas entradas, misma
 * salida, sin red ni reloj.
 */
export function queryCatalog(
  products: readonly PublicProduct[],
  query: CatalogQuery = {},
): CatalogResult {
  const termino = normalizeForSearch(query.q ?? "");
  const tokens = termino.length >= MIN_QUERY_CHARS ? termino.split(" ").filter(Boolean) : [];

  let base = products.filter((p) => {
    if (query.brandSlug && p.brandSlug !== query.brandSlug) return false;
    if (query.categorySlug && p.categorySlug !== query.categorySlug) return false;
    return true;
  });

  let usedFuzzy = false;
  if (tokens.length > 0) {
    const textos = new Map(base.map((p) => [p.slug, haystack(p)]));
    const exactos = base.filter((p) =>
      tokens.every((t) => tokenMatches(textos.get(p.slug) ?? "", t, false)),
    );
    if (exactos.length > 0) {
      base = exactos;
    } else {
      // Solo aquí se tolera la errata: como último recurso, nunca como norma.
      const aproximados = base.filter((p) =>
        tokens.every((t) => tokenMatches(textos.get(p.slug) ?? "", t, true)),
      );
      usedFuzzy = aproximados.length > 0;
      base = aproximados;
    }
  }

  const ordenados = [...base].sort((a, b) => comparar(a, b, query.sort, tokens));

  const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  const total = ordenados.length;
  const pageCount = Math.ceil(total / pageSize);
  // Una página fuera de rango se ajusta al último válido: un enlace viejo o un
  // parámetro tecleado a mano debe enseñar productos, no una pantalla vacía.
  const page = Math.min(Math.max(1, Math.trunc(query.page ?? 1)), Math.max(1, pageCount));
  const desde = (page - 1) * pageSize;

  return {
    items: ordenados.slice(desde, desde + pageSize),
    total,
    page,
    pageCount,
    usedFuzzy,
  };
}
