import type { Product } from "@/types";

/**
 * Filtro de texto de la pantalla de Stock (`/inventario`).
 *
 * FUENTE ÚNICA del "heno" (haystack) de búsqueda: incluye el **código de barra
 * (barcode)** además de nombre, SKU, marca, categoría, laboratorio y lotes.
 * Antes el barcode se omitía y buscar/escanear un EAN-13 no devolvía nada,
 * aunque el producto sí lo tuviera. La pantalla de Productos (`/productos`) ya
 * lo incluía; esto empareja ambos comportamientos.
 *
 * Puro (sin React ni DOM) → testeable en node.
 */
export interface InventorySearchable {
  product: Pick<Product, "name" | "sku" | "barcode">;
  brandName?: string;
  categoryName?: string;
  labName?: string;
  /** Números de lote unidos por espacio. */
  lotNumbers?: string;
}

/** Texto único, en minúsculas, sobre el que se hace `includes`. */
export function inventorySearchHaystack(row: InventorySearchable): string {
  const { product } = row;
  return [
    product.name,
    product.sku,
    product.barcode,
    row.brandName,
    row.categoryName,
    row.labName,
    row.lotNumbers,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** ¿La fila coincide con el término? Término vacío ⇒ coincide con todo. */
export function matchesInventorySearch(
  row: InventorySearchable,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return inventorySearchHaystack(row).includes(q);
}
