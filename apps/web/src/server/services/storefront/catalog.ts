import "server-only";
import { cache } from "react";
import { isSellableForWeb } from "@/features/storefront/availability";
import { slugify } from "@/features/storefront/slug";
import type { PublicProduct, PublicTaxonomy } from "@/features/storefront/types";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";
import {
  publicImageUrl,
  toPublicProduct,
  type WebMetaRow,
  type WebProductRow,
  type WebTaxonomyRef,
} from "./public-product";

/**
 * Carga del catálogo YA PUBLICADO, con service-role acotado por `business_id`.
 *
 * Por qué service-role y no la clave anónima: la anónima viaja en el navegador.
 * Si se abriera una política de `SELECT` para `anon` sobre `products`,
 * cualquiera podría pedir `/rest/v1/products?select=cost,price` a PostgREST y
 * leer los costos de todo el catálogo — RLS filtra FILAS, no COLUMNAS. Se sigue
 * el precedente ya vigente de `server/services/sales/shared-document.ts` (la
 * factura pública por token): módulo `server-only`, `.eq("business_id", …)` en
 * cada consulta y jamás `select("*")`.
 *
 * Ninguna consulta de este archivo va sin `.range()`: PostgREST corta en 1000
 * filas EN SILENCIO, y con 1 371 lotes el stock saldría incompleto —productos
 * con existencias anunciados como "Agotado"— sin ningún error que lo delatara.
 */

/** Cuántos ids caben en un `in.(…)`: la consulta viaja en la URL de un GET. */
const ID_CHUNK = 150;

/** Columnas de `products` que se leen. Cualquier otra sería una fuga. */
const PRODUCT_COLUMNS =
  "id, name, presentation, price, image_url, brand_id, category_id";

/** Columnas de `product_web_meta` que se leen. */
const META_COLUMNS =
  "product_id, slug, featured, is_new, sort_order, web_title, web_summary, web_description, benefits, how_to_use, seo_title, seo_description, image_alt";

export interface PublishedCatalog {
  products: PublicProduct[];
  brands: PublicTaxonomy[];
  categories: PublicTaxonomy[];
}

const CATALOGO_VACIO: PublishedCatalog = { products: [], brands: [], categories: [] };

function chunk<T>(items: readonly T[], size: number): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < items.length; i += size) partes.push(items.slice(i, i + size));
  return partes;
}

/**
 * Slug de marca o categoría a partir del nombre, con desempate determinista.
 *
 * Dos marcas distintas que dieran el mismo slug ("L'Oréal" y "L Oreal") harían
 * que un filtro enseñara productos de las dos. El desempate usa 6 hexadecimales
 * del id —igual que `productSlug`— y no un contador, para que no dependa del
 * orden en que la base devuelva las filas.
 */
function buildTaxonomyRefs(
  rows: readonly { id: string; name: string }[],
): Map<string, WebTaxonomyRef> {
  const usados = new Set<string>();
  const refs = new Map<string, WebTaxonomyRef>();
  for (const fila of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    const base = slugify(fila.name) || "otros";
    const slug = usados.has(base)
      ? `${base}-${fila.id.replace(/-/g, "").slice(0, 6)}`
      : base;
    usados.add(slug);
    refs.set(fila.id, { name: fila.name, slug });
  }
  return refs;
}

/** Cuenta productos por marca/categoría y descarta las que quedarían vacías. */
function taxonomyCounts(
  products: readonly PublicProduct[],
  pick: (p: PublicProduct) => { slug?: string; name?: string },
): PublicTaxonomy[] {
  const acumulado = new Map<string, PublicTaxonomy>();
  for (const producto of products) {
    const { slug, name } = pick(producto);
    if (!slug || !name) continue;
    const previo = acumulado.get(slug);
    if (previo) previo.productCount += 1;
    else acumulado.set(slug, { slug, name, productCount: 1 });
  }
  return [...acumulado.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Catálogo publicado de un negocio.
 *
 * Memoizado por petición: el catálogo, la ficha de producto y los metadatos SEO
 * de una misma página lo piden por separado. `cache()` de React lo resuelve una
 * vez por petición; la caché entre peticiones la fija cada ruta con su
 * `revalidate`, no este servicio.
 */
export const loadPublishedCatalog = cache(
  async (businessId: string): Promise<PublishedCatalog> => {
    const sb = createServiceRoleClient();
    if (!sb) return CATALOGO_VACIO;
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;

    // ── 1) Qué está publicado ────────────────────────────────────────────────
    // La AUSENCIA de fila significa "no publicado" (fail-closed): aquí solo se
    // pregunta por las que existen Y están marcadas visibles.
    const metas = await fetchAllPages<WebMetaRow & { sort_order: number }>(
      async (from, to) => {
        const { data, error } = await sb
          .from("product_web_meta")
          .select(META_COLUMNS)
          .eq("business_id", businessId)
          .eq("visible", true)
          .order("sort_order", { ascending: true })
          .order("product_id", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      },
    );
    if (metas.length === 0) return CATALOGO_VACIO;

    const ids = metas.map((m) => m.product_id);

    // ── 2) Los productos, con los filtros duros en la base ───────────────────
    // Publicado no basta: un producto puede haberse desactivado, quedarse sin
    // precio o pasar a exigir receta DESPUÉS de publicarse. Estos filtros son
    // los mismos que aplicó el sembrado, y se vuelven a aplicar en cada lectura
    // porque el catálogo cambia todos los días y `product_web_meta` no se entera.
    const productos: WebProductRow[] = [];
    for (const grupo of chunk(ids, ID_CHUNK)) {
      const { data, error } = await sb
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("business_id", businessId)
        .in("id", grupo)
        .eq("active", true)
        .eq("sellable", true)
        .eq("requires_prescription", false)
        .eq("controlled", false)
        .is("deleted_at", null)
        .gt("price", 0);
      if (error) throw error;
      productos.push(...(data ?? []));
    }
    if (productos.length === 0) return CATALOGO_VACIO;

    // ── 3) Existencias vendibles ─────────────────────────────────────────────
    // Misma regla que el POS: lote disponible, con cantidad y sin vencer. Se
    // filtra en la base para no traer los 1 371 lotes, y se vuelve a comprobar
    // en memoria con `isSellableForWeb` para que la regla tenga UNA sola
    // definición —la probada— y no dos que puedan separarse.
    const hoy = new Date().toISOString().slice(0, 10);
    const lotes = await fetchAllPages<{
      product_id: string;
      status: string;
      current_quantity: number;
      expires_at: string | null;
    }>(async (from, to) => {
      const { data, error } = await sb
        .from("product_lots")
        .select("product_id, status, current_quantity, expires_at")
        .eq("business_id", businessId)
        .eq("status", "available")
        .gt("current_quantity", 0)
        .gte("expires_at", hoy)
        .order("product_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    });

    const existencias = new Map<string, number>();
    for (const lote of lotes) {
      const vendible = isSellableForWeb(
        {
          status: lote.status,
          currentQuantity: lote.current_quantity,
          expiresAt: lote.expires_at,
        },
        hoy,
      );
      if (!vendible) continue;
      existencias.set(
        lote.product_id,
        (existencias.get(lote.product_id) ?? 0) + lote.current_quantity,
      );
    }

    // ── 4) Marcas y categorías ───────────────────────────────────────────────
    const marcaIds = [...new Set(productos.map((p) => p.brand_id).filter(Boolean))] as string[];
    const categoriaIds = [...new Set(productos.map((p) => p.category_id).filter(Boolean))] as string[];

    const [marcas, categorias] = await Promise.all([
      loadTaxonomy(sb, "brands", businessId, marcaIds),
      loadTaxonomy(sb, "product_categories", businessId, categoriaIds),
    ]);

    // ── 5) Ensamblado por lista blanca ───────────────────────────────────────
    const porId = new Map(productos.map((p) => [p.id, p]));
    const items: PublicProduct[] = [];
    for (const meta of metas) {
      const producto = porId.get(meta.product_id);
      if (!producto) continue; // publicado pero ya no elegible: no se enseña.
      // Sin foto válida no entra al catálogo: R-WEB-05/06. Las 12 URLs a un CDN
      // ajeno y el `data:` de la base caen aquí.
      if (!publicImageUrl(producto.image_url, supabaseUrl)) continue;
      items.push(
        toPublicProduct({
          product: producto,
          meta,
          brand: producto.brand_id ? marcas.get(producto.brand_id) : null,
          category: producto.category_id ? categorias.get(producto.category_id) : null,
          availableQuantity: existencias.get(producto.id) ?? 0,
          supabaseUrl,
        }),
      );
    }

    return {
      products: items,
      brands: taxonomyCounts(items, (p) => ({ slug: p.brandSlug, name: p.brandName })),
      categories: taxonomyCounts(items, (p) => ({
        slug: p.categorySlug,
        name: p.categoryName,
      })),
    };
  },
);

/** Lee los nombres de marcas o categorías por id, en grupos y sin `select("*")`. */
async function loadTaxonomy(
  sb: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tabla: "brands" | "product_categories",
  businessId: string,
  ids: readonly string[],
): Promise<Map<string, WebTaxonomyRef>> {
  if (ids.length === 0) return new Map();
  const filas: { id: string; name: string }[] = [];
  for (const grupo of chunk(ids, ID_CHUNK)) {
    const { data, error } = await sb
      .from(tabla)
      .select("id, name")
      .eq("business_id", businessId)
      .in("id", grupo);
    if (error) throw error;
    filas.push(...(data ?? []));
  }
  return buildTaxonomyRefs(filas);
}

/**
 * Un producto publicado por su slug, o `null`.
 *
 * Se resuelve sobre el catálogo ya cargado en vez de con una consulta propia:
 * en la misma petición la ficha suele venir acompañada del catálogo (migas,
 * relacionados, metadatos), `cache()` lo comparte, y así la ficha no puede
 * enseñar un producto que el catálogo considera no publicable.
 */
export async function findPublishedProduct(
  businessId: string,
  slug: string,
): Promise<PublicProduct | null> {
  const { products } = await loadPublishedCatalog(businessId);
  return products.find((p) => p.slug === slug) ?? null;
}
