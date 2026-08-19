// Tipos PÚBLICOS de la tienda en línea (/tienda).
//
// Regla que gobierna este archivo: todo lo que aparece aquí puede terminar en el
// HTML, en un JSON o en los datos estructurados de una página pública. Por eso
// NUNCA debe crecer con campos internos —costo, margen, stock exacto, lote,
// vencimiento, proveedor, SKU, código de barras, business_id ni UUID interno—.
// El mapper `server/services/storefront/public-product.ts` construye estos
// objetos por lista blanca, y hay una prueba que falla si se cuela un campo
// prohibido. Ampliar `PublicProduct` es una decisión deliberada, no un descuido.

/**
 * Disponibilidad tal como la ve el cliente. Es un booleano disfrazado a
 * propósito: la cantidad exacta de existencias es información interna y nunca
 * sale del servidor.
 */
export type AvailabilityStatus = "in_stock" | "out_of_stock";

export interface Availability {
  status: AvailabilityStatus;
  /** Texto visible. La disponibilidad NUNCA se comunica solo por color. */
  label: string;
}

/** Producto publicado, tal como lo consume la tienda. */
export interface PublicProduct {
  /** Identificador público estable. Nunca el UUID interno. */
  slug: string;
  /** Título comercial: `web_title` si existe, si no el nombre del catálogo. */
  title: string;
  summary?: string;
  description?: string;
  benefits: string[];
  howToUse?: string;
  brandName?: string;
  brandSlug?: string;
  categoryName?: string;
  categorySlug?: string;
  presentation?: string;
  /** Precio de venta en DOP, con ITBIS incluido (igual que el POS). */
  price: number;
  /** Solo URLs del bucket público de Supabase; si no, null → marcador. */
  imageUrl: string | null;
  imageAlt?: string;
  availability: Availability;
  featured: boolean;
  isNew: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

/** Marca o categoría en su forma pública (para filtros y navegación). */
export interface PublicTaxonomy {
  slug: string;
  name: string;
  /** Cuántos productos publicados tiene. Sirve para no ofrecer filtros vacíos. */
  productCount: number;
}

/** Sucursal visible en la tienda. */
export interface PublicBranch {
  slug: string;
  /** Nombre de cara al público; puede diferir del nombre interno del sistema. */
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  /** Enlace de Google Maps, ya normalizado. Se publica como «Cómo llegar». */
  mapsUrl?: string;
  /** Instagram de ESTA sucursal. Si falta, el pie usa el del negocio. */
  instagramUrl?: string;
}

/** Negocio dueño de la tienda, resuelto en servidor y nunca por el visitante. */
export interface StorefrontTenant {
  businessId: string;
  siteName: string;
  tagline?: string;
  seoTitle?: string;
  seoDescription?: string;
  ogImageUrl?: string;
  whatsappPhone?: string;
  contactEmail?: string;
  /** Instagram del negocio: respaldo de las sucursales que no tengan el suyo. */
  instagramUrl?: string;
  /** Árbol de enlaces del negocio (Linktree, Beacons, su propia web). */
  linktreeUrl?: string;
  /** Enlace de pago de Azul. Ausente = no se ofrece tarjeta en la tienda. */
  azulPaymentLinkUrl?: string;
  branches: PublicBranch[];
}

/** Orden disponible en el catálogo. Se serializa en la URL (`?orden=`). */
export type CatalogSort =
  | "relevancia"
  | "nombre"
  | "precio-asc"
  | "precio-desc"
  | "nuevos";

export const CATALOG_SORTS: readonly CatalogSort[] = [
  "relevancia",
  "nombre",
  "precio-asc",
  "precio-desc",
  "nuevos",
] as const;

export interface CatalogQuery {
  /** Texto libre. Tolera acentos, mayúsculas y una errata por palabra. */
  q?: string;
  brandSlug?: string;
  categorySlug?: string;
  sort?: CatalogSort;
  page?: number;
  pageSize?: number;
}

export interface CatalogResult {
  items: PublicProduct[];
  /** Total de coincidencias ANTES de paginar. */
  total: number;
  page: number;
  pageCount: number;
  /** true si no hubo coincidencia exacta y se recurrió a tolerar erratas. */
  usedFuzzy: boolean;
}
