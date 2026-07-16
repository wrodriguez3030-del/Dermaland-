/** Ítem mínimo de una transferencia para la búsqueda. */
export interface TransferSearchItem {
  productId: string;
  lotNumber: string;
}

/** Forma mínima de transferencia para la búsqueda. */
export interface TransferSearchable {
  transferNumber: string;
  createdByName: string;
  items: TransferSearchItem[];
}

/** Datos del producto usados para matchear (nombre + código de barra). */
export interface ProductRef {
  name?: string;
  barcode?: string;
}

/**
 * ¿La transferencia coincide con el término? Matchea por número, usuario y —por
 * cada ítem— número de lote, NOMBRE y CÓDIGO DE BARRA del producto (resueltos
 * vía `lookup`). Término vacío → siempre true.
 */
export function matchesTransferSearch(
  t: TransferSearchable,
  term: string,
  lookup: (productId: string) => ProductRef | undefined,
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  if (t.transferNumber.toLowerCase().includes(q)) return true;
  if (t.createdByName.toLowerCase().includes(q)) return true;
  return t.items.some((i) => {
    if (i.lotNumber.toLowerCase().includes(q)) return true;
    const p = lookup(i.productId);
    if (!p) return false;
    if (p.name && p.name.toLowerCase().includes(q)) return true;
    if (p.barcode && p.barcode.toLowerCase().includes(q)) return true;
    return false;
  });
}
