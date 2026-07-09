// Tipos compartidos del buscador global. Sin imports de servidor ni React:
// los usan el repositorio (servidor), la ruta API y la UI.

/** Categorías del buscador global. El orden define la prioridad de despliegue. */
export type SearchGroupKind =
  | "product"
  | "customer"
  | "invoice"
  | "proforma"
  | "lot";

/** Un resultado individual, ya listo para pintar y navegar (sin UUID visible). */
export interface SearchResultItem {
  kind: SearchGroupKind;
  /** id técnico — SOLO para construir el href, nunca se muestra en la UI. */
  id: string;
  /** Título visible (nombre de producto, cliente, número de documento, lote). */
  title: string;
  /** Segunda línea (SKU, teléfono, cliente de la factura, producto del lote…). */
  subtitle?: string;
  /** Tercera pista corta (stock, total, vencimiento, estado). */
  meta?: string;
  /** Ruta interna a la que navega el resultado (nunca 404, nunca UUID en UI). */
  href: string;
}

/** Resultados agrupados por categoría + total (para "ver todos"). */
export interface GlobalSearchResults {
  query: string;
  groups: {
    kind: SearchGroupKind;
    label: string;
    items: SearchResultItem[];
  }[];
  total: number;
}

/** Etiqueta legible por categoría (encabezado de grupo en el dropdown). */
export const SEARCH_GROUP_LABEL: Record<SearchGroupKind, string> = {
  product: "Productos",
  customer: "Clientes",
  invoice: "Facturas",
  proforma: "Proformas",
  lot: "Lotes",
};

/** Orden de despliegue de los grupos. */
export const SEARCH_GROUP_ORDER: SearchGroupKind[] = [
  "product",
  "customer",
  "invoice",
  "proforma",
  "lot",
];

/** Mínimo de caracteres para disparar la búsqueda. */
export const SEARCH_MIN_CHARS = 2;

/** Máximo de resultados por categoría en el dropdown. */
export const SEARCH_PER_GROUP = 6;
