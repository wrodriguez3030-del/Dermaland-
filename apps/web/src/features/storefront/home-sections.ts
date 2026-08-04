// Qué estantes tiene la portada de la tienda.
//
// Está separado de la página porque es la única parte con reglas de negocio
// —cuántos productos por estante, cuándo un estante no merece enseñarse, en qué
// orden van las categorías— y así se prueba entera sin React ni base de datos.
//
// Determinista a propósito: el catálogo va cacheado cinco minutos, así que un
// orden con `Math.random()` serviría portadas distintas según a quién le tocara
// refrescar la caché, y no habría forma de probarlo.

import { categoryHref } from "./catalog-params";
import type { PublicProduct, PublicTaxonomy } from "./types";

export interface HomeSection {
  /** Estable, para la `key` de React y para las pruebas. */
  key: string;
  title: string;
  /** Destino de "Ver todo". `null` si el estante no tiene página propia. */
  href: string | null;
  items: PublicProduct[];
}

export interface HomeSectionsOptions {
  /** Productos por estante. */
  shelfSize?: number;
  /** Por debajo de esto el estante no se enseña. */
  minItems?: number;
  /** Cuántas categorías llegan a la portada. */
  maxCategories?: number;
}

const POR_DEFECTO = {
  shelfSize: 8,
  /** Menos de cuatro deja un estante con huecos: mejor no enseñarlo. */
  minItems: 4,
  maxCategories: 6,
} as const;

/** Solo entra a un estante lo que se puede comprar hoy y tiene foto. */
function vendible(p: PublicProduct): boolean {
  return p.availability.status === "in_stock" && p.imageUrl !== null;
}

function ordenar(a: PublicProduct, b: PublicProduct): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
  return a.title.localeCompare(b.title, "es");
}

export function buildHomeSections(
  products: readonly PublicProduct[],
  categories: readonly PublicTaxonomy[],
  options: HomeSectionsOptions = {},
): HomeSection[] {
  const { shelfSize, minItems, maxCategories } = { ...POR_DEFECTO, ...options };

  const disponibles = products.filter(vendible).sort(ordenar);
  const secciones: HomeSection[] = [];
  // Un producto no se repite entre estantes: verlo tres veces al bajar da la
  // sensación de catálogo corto, justo lo contrario de lo que se busca.
  const usados = new Set<string>();

  const tomar = (candidatos: PublicProduct[]): PublicProduct[] =>
    candidatos.filter((p) => !usados.has(p.slug)).slice(0, shelfSize);

  const añadir = (
    key: string,
    title: string,
    href: string | null,
    items: PublicProduct[],
  ) => {
    if (items.length < minItems) return;
    items.forEach((p) => usados.add(p.slug));
    secciones.push({ key, title, href, items });
  };

  añadir(
    "destacados",
    "Destacados",
    null,
    tomar(disponibles.filter((p) => p.featured)),
  );
  añadir(
    "novedades",
    "Novedades",
    null,
    tomar(disponibles.filter((p) => p.isNew)),
  );

  // Las categorías con más catálogo primero: son las que mejor representan lo
  // que vende la tienda. Desempate por nombre para que el orden no dependa de
  // cómo llegara la lista.
  const porTamaño = [...categories].sort(
    (a, b) =>
      b.productCount - a.productCount || a.name.localeCompare(b.name, "es"),
  );

  for (const categoria of porTamaño) {
    const puestas = secciones.filter((s) =>
      s.key.startsWith("categoria:"),
    ).length;
    if (puestas >= maxCategories) break;
    añadir(
      `categoria:${categoria.slug}`,
      categoria.name,
      categoryHref(categoria.slug),
      tomar(disponibles.filter((p) => p.categorySlug === categoria.slug)),
    );
  }

  return secciones;
}
