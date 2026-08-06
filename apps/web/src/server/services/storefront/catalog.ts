import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { isSellableForWeb } from "@/features/storefront/availability";
import { isPublishable } from "@/features/storefront/publishability";
import { slugify } from "@/features/storefront/slug";
import type {
  PublicProduct,
  PublicTaxonomy,
} from "@/features/storefront/types";
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
import { committedUnitsForCatalog } from "./stock";

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

/**
 * Columnas de `products` que se leen. Cualquier otra sería una fuga.
 *
 * Las cinco últimas no se publican: alimentan la regla de publicabilidad, que
 * se evalúa aquí en TypeScript y no con filtros SQL. Escribirla como `WHERE`
 * habría dejado una segunda copia de la regla —la primera está en
 * `features/storefront/publishability.ts`— y dos copias de una regla que cambia
 * son la forma segura de que un día el catálogo enseñe algo que no debía.
 */
const PRODUCT_COLUMNS =
  "id, name, presentation, price, image_url, brand_id, category_id, active, sellable, deleted_at, requires_prescription, controlled";

/** Columnas de `product_web_meta` que se leen. */
const META_COLUMNS =
  "product_id, slug, featured, is_new, sort_order, web_title, web_summary, web_description, benefits, how_to_use, seo_title, seo_description, image_alt";

export interface PublishedCatalog {
  products: PublicProduct[];
  brands: PublicTaxonomy[];
  categories: PublicTaxonomy[];
}

/**
 * Etiqueta de caché del catálogo. Publicar o despublicar un producto debe
 * llamar a `revalidateTag(STOREFRONT_CATALOG_TAG)`: sin eso, el cambio tardaría
 * hasta `SEGUNDOS_DE_CACHE` en verse y el administrador creería que no funcionó.
 */
export const STOREFRONT_CATALOG_TAG = "storefront-catalog";

/** Cuánto vive el catálogo en caché entre peticiones. */
const SEGUNDOS_DE_CACHE = 300;

const CATALOGO_VACIO: PublishedCatalog = {
  products: [],
  brands: [],
  categories: [],
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    partes.push(items.slice(i, i + size));
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
  return [...acumulado.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
}

/**
 * Catálogo publicado de un negocio, con caché en DOS niveles.
 *
 * `cache()` de React lo resuelve una vez por PETICIÓN: el catálogo, la ficha de
 * producto y los metadatos SEO de una misma página lo piden por separado y deben
 * ver lo mismo sin repetir el viaje.
 *
 * `unstable_cache` lo conserva ENTRE peticiones. Va aquí y no en el
 * `revalidate` de la ruta porque la página del catálogo depende de la barra de
 * dirección (`?q=`, `?marca=`, `?pagina=`) y por eso se renderiza siempre en
 * caliente: sin esta capa, cada búsqueda que teclea cada visitante golpearía la
 * base con la decena de consultas de abajo. La etiqueta permite que el admin de
 * catálogo lo invalide al publicar, en vez de esperar los cinco minutos.
 */
/**
 * Versión de lo que hay guardado. **Súbela cuando cambie el SIGNIFICADO del
 * catálogo cacheado**, no cuando cambie la pantalla.
 *
 * Sin esto, al dejar de listar lo agotado la tienda siguió sirviendo el
 * catálogo viejo: la caché de datos de Vercel sobrevive a los despliegues y la
 * clave era la misma, así que las entradas escritas por el código anterior se
 * daban por buenas. El resultado fue una tienda con el código nuevo y los datos
 * de antes — 626 productos en vez de 359— y desde fuera parecía que el cambio
 * no se había desplegado.
 *
 * Una entrada vieja con otro criterio no está "un poco desactualizada": está
 * mal. Cambiar la clave es la forma de que no se pueda leer.
 */
const VERSION_DEL_CATALOGO = "v3-descuenta-apalabrado";

export const loadPublishedCatalog = cache(
  async (businessId: string): Promise<PublishedCatalog> =>
    unstable_cache(
      () => leerCatalogoPublicado(businessId),
      ["storefront-catalog", VERSION_DEL_CATALOGO, businessId],
      {
        revalidate: SEGUNDOS_DE_CACHE,
        tags: [STOREFRONT_CATALOG_TAG],
      },
    )(),
);

const leerCatalogoPublicado = async (
  businessId: string,
): Promise<PublishedCatalog> => {
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

  // ── 2) Los productos ─────────────────────────────────────────────────────
  // Publicado no basta: un producto puede haberse desactivado, quedarse sin
  // precio o pasar a exigir receta DESPUÉS de publicarse. La regla se aplica en
  // cada lectura porque el catálogo cambia todos los días y `product_web_meta`
  // no se entera.
  const productos: WebProductRow[] = [];
  for (const grupo of chunk(ids, ID_CHUNK)) {
    const { data, error } = await sb
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("business_id", businessId)
      .in("id", grupo);
    if (error) throw error;
    productos.push(...(data ?? []));
  }
  const publicables = productos.filter((p) =>
    isPublishable({
      active: p.active,
      sellable: p.sellable,
      deletedAt: p.deleted_at,
      price: p.price,
      requiresPrescription: p.requires_prescription,
      controlled: p.controlled,
      hasValidImage: !!publicImageUrl(p.image_url, supabaseUrl),
    }),
  );
  if (publicables.length === 0) return CATALOGO_VACIO;

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

  // Lo apalabrado en pedidos web abiertos y sin facturar NO está disponible,
  // aunque el frasco siga en el estante: ya tiene dueño.
  //
  // Sin esto el catálogo contaba distinto que el checkout —él sí lo restaba— y
  // el resultado era ofrecer lo que luego se rechazaba: "Se nos acabó
  // A-derma Dermalibour Barrier. Quítalo del carrito para seguir", sobre un
  // producto cuyo último frasco estaba comprometido en el pedido WEB-000023.
  // Publicar algo que no se va a poder vender es peor que no publicarlo.
  const comprometido = await committedUnitsForCatalog(sb, businessId);
  for (const [productId, unidades] of comprometido) {
    const enEstante = existencias.get(productId);
    if (enEstante === undefined) continue;
    existencias.set(productId, Math.max(0, enEstante - unidades));
  }

  // ── 4) Marcas y categorías ───────────────────────────────────────────────
  const marcaIds = [
    ...new Set(publicables.map((p) => p.brand_id).filter(Boolean)),
  ] as string[];
  const categoriaIds = [
    ...new Set(publicables.map((p) => p.category_id).filter(Boolean)),
  ] as string[];

  const [marcas, categorias] = await Promise.all([
    loadTaxonomy(sb, "brands", businessId, marcaIds),
    loadTaxonomy(sb, "product_categories", businessId, categoriaIds),
  ]);

  // ── 5) Ensamblado por lista blanca ───────────────────────────────────────
  //
  // LO AGOTADO NO ENTRA. Antes salía con su etiqueta "Agotado" —era una
  // decisión escrita, §3.8— y el resultado fue que casi la mitad del catálogo
  // eran callejones sin salida: el cliente entra, le gusta, y no lo puede
  // comprar. El dueño lo cambió y tiene razón: una tienda enseña lo que vende.
  //
  // No hace falta despublicar nada a mano. Esto se recalcula con cada carga del
  // catálogo, así que un producto vuelve solo en cuanto entre existencia.
  const porId = new Map(publicables.map((p) => [p.id, p]));
  const items: PublicProduct[] = [];
  for (const meta of metas) {
    const producto = porId.get(meta.product_id);
    // Marcado como visible pero ya no publicable (se desactivó, perdió el
    // precio o la foto): no se enseña. R-WEB-05/06.
    if (!producto) continue;
    if ((existencias.get(producto.id) ?? 0) <= 0) continue;
    items.push(
      toPublicProduct({
        product: producto,
        meta,
        brand: producto.brand_id ? marcas.get(producto.brand_id) : null,
        category: producto.category_id
          ? categorias.get(producto.category_id)
          : null,
        availableQuantity: existencias.get(producto.id) ?? 0,
        supabaseUrl,
      }),
    );
  }

  return {
    products: items,
    brands: taxonomyCounts(items, (p) => ({
      slug: p.brandSlug,
      name: p.brandName,
    })),
    categories: taxonomyCounts(items, (p) => ({
      slug: p.categorySlug,
      name: p.categoryName,
    })),
  };
};

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
