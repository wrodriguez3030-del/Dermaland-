import "server-only";
import { availabilityFrom } from "@/features/storefront/availability";
import type { PublicProduct } from "@/features/storefront/types";

/**
 * Traducción de una fila interna al objeto que ve internet.
 *
 * Este archivo es la ÚNICA frontera entre el catálogo del ERP y el HTML público,
 * y está escrito como lista blanca a propósito: `toPublicProduct` nombra campo a
 * campo lo que sale. Un `...spread` de la fila publicaría el costo y el margen
 * de todo el catálogo la primera vez que alguien añadiera una columna, sin que
 * ninguna prueba se enterara. Aquí, añadir un campo público es una línea escrita
 * a mano y revisable en el diff.
 *
 * Nunca salen: `cost`, `min_stock`/`max_stock`, la CANTIDAD exacta de
 * existencias, nada de `product_lots` (lote, vencimiento, costo unitario,
 * proveedor, almacén), `business_id`, el UUID interno, el SKU ni el código de
 * barras. `public-product.test.ts` falla si alguno aparece serializado.
 */

/**
 * Ruta del bucket público de fotos de producto. Una URL que no empiece por aquí
 * —un enlace a un CDN ajeno, un `data:` guardado en la columna— NO se publica:
 * cae al marcador de posición. Ver `docs/tienda-en-linea.md` §2.6 (R-WEB-06).
 */
export const PUBLIC_IMAGE_PATH = "/storage/v1/object/public/product-images/";

/** Columnas de `products` que la tienda necesita. NUNCA `select("*")`. */
export interface WebProductRow {
  id: string;
  name: string;
  presentation: string | null;
  price: number;
  image_url: string | null;
  brand_id: string | null;
  category_id: string | null;
}

/** Columnas de `product_web_meta` que la tienda necesita. */
export interface WebMetaRow {
  product_id: string;
  slug: string;
  featured: boolean;
  is_new: boolean;
  web_title: string | null;
  web_summary: string | null;
  web_description: string | null;
  benefits: string[];
  how_to_use: string | null;
  seo_title: string | null;
  seo_description: string | null;
  image_alt: string | null;
}

/** Marca o categoría ya resuelta a su forma pública. */
export interface WebTaxonomyRef {
  name: string;
  slug: string;
}

export interface ToPublicProductInput {
  product: WebProductRow;
  meta: WebMetaRow;
  brand?: WebTaxonomyRef | null;
  category?: WebTaxonomyRef | null;
  /**
   * Existencias vendibles sumadas EN EL SERVIDOR. Entra como número y sale como
   * booleano: es el punto exacto donde se pierde el dato interno.
   */
  availableQuantity: number;
  /** Origen de las fotos, para comprobar que la URL es del bucket propio. */
  supabaseUrl: string | undefined;
}

/**
 * URL de foto publicable, o `null`.
 *
 * Exige bucket propio y `https`. Un hotlink a `cdn1.costatic.com` deja el
 * catálogo a merced de un tercero (puede caerse, cambiar la imagen o registrar
 * a cada visitante); un `data:` de 32 KB dentro de la columna infla cada
 * respuesta HTML. Ninguno de los dos se publica.
 */
export function publicImageUrl(
  raw: string | null | undefined,
  supabaseUrl: string | undefined,
): string | null {
  if (!raw || !supabaseUrl) return null;
  let url: URL;
  let base: URL;
  try {
    url = new URL(raw);
    base = new URL(supabaseUrl);
  } catch {
    // Rutas relativas y `data:` sin esquema válido caen aquí.
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.host !== base.host) return null;
  if (!url.pathname.startsWith(PUBLIC_IMAGE_PATH)) return null;
  return url.toString();
}

/** Texto no vacío, o `undefined` (para no serializar cadenas en blanco). */
function texto(valor: string | null | undefined): string | undefined {
  const limpio = valor?.trim();
  return limpio ? limpio : undefined;
}

/** Construye el objeto público. Campo a campo, nunca por copia de la fila. */
export function toPublicProduct(input: ToPublicProductInput): PublicProduct {
  const { product, meta, brand, category, availableQuantity, supabaseUrl } = input;
  const title = texto(meta.web_title) ?? product.name;
  const imageUrl = publicImageUrl(product.image_url, supabaseUrl);

  return {
    slug: meta.slug,
    title,
    summary: texto(meta.web_summary),
    description: texto(meta.web_description),
    benefits: (meta.benefits ?? []).map((b) => b.trim()).filter(Boolean),
    howToUse: texto(meta.how_to_use),
    brandName: texto(brand?.name),
    brandSlug: texto(brand?.slug),
    categoryName: texto(category?.name),
    categorySlug: texto(category?.slug),
    presentation: texto(product.presentation),
    price: product.price,
    imageUrl,
    // Sin foto no hay `alt` que dar; con foto, el `alt` propio o el título.
    imageAlt: imageUrl ? (texto(meta.image_alt) ?? title) : undefined,
    availability: availabilityFrom(availableQuantity),
    featured: meta.featured,
    isNew: meta.is_new,
    seoTitle: texto(meta.seo_title),
    seoDescription: texto(meta.seo_description),
  };
}
