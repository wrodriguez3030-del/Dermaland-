// Validación PURA del formulario de producto (Nuevo / Editar). Testeable sin
// React. Devuelve las CLAVES de los campos requeridos que faltan; la UI las
// resalta. El SKU no se valida (lo genera el sistema). El ITBIS 0% es válido.

export interface ProductFormValues {
  name: string;
  price: string;
  itbisRate: string;
  unit: string;
  /** Checkbox "Crear un lote inicial junto con el producto". */
  withLot: boolean;
  lotBranch: string;
  lotNumber: string;
  lotQty: string;
  lotExpiry: string;
}

export function validateProductForm(v: ProductFormValues): string[] {
  const m: string[] = [];
  if (!v.name.trim()) m.push("name");
  if (v.price.trim() === "" || Number.isNaN(Number(v.price))) m.push("price");
  // ITBIS requerido, pero 0% (Exento) es válido: solo falla si no es número.
  if (v.itbisRate.trim() === "" || Number.isNaN(Number(v.itbisRate))) m.push("itbisRate");
  if (!v.unit.trim()) m.push("unit");
  // Lote inicial: SOLO se exige si el checkbox está activado.
  if (v.withLot) {
    if (!v.lotBranch) m.push("branchId");
    if (!v.lotNumber.trim()) m.push("lotNumber");
    if (!(Number(v.lotQty) > 0)) m.push("initialQuantity");
    if (!v.lotExpiry) m.push("expiresAt");
  }
  return m;
}

/**
 * ¿El SKU ya lo tiene OTRO producto al EDITAR? (pre-chequeo de cliente).
 *
 * REGLA: al editar, la unicidad debe excluir el id del producto actual.
 *
 * En modo `supabase` la fuente ÚNICA es el servidor: la unicidad la garantiza el
 * índice único `(business_id, sku)` en la base (ver `product.create` que
 * reintenta ante 23505) y el SKU es READONLY, así que al editar nunca cambia y no
 * puede colisionar. El catálogo local (`listAllProducts()` = seed mock +
 * localStorage) tiene OTROS ids que los reales de Supabase (p. ej. el mismo
 * producto ISDIN es `prod_isd_005` en el mock pero un UUID en Supabase). Por eso
 * `p.id !== currentId` jamás coincidía con el gemelo mock y el pre-chequeo
 * reportaba un falso "Ya existe otro producto con SKU …" en CADA edición. En
 * `supabase` se delega 100% al servidor → devuelve `false`.
 *
 * En modo `local` sí tiene sentido chequear contra el store (los ids coinciden),
 * excluyendo el producto que se está editando.
 */
export function skuTakenOnEdit(params: {
  backend: "local" | "supabase";
  products: ReadonlyArray<{ id: string; sku: string }>;
  sku: string;
  currentId: string;
}): boolean {
  if (params.backend !== "local") return false;
  const target = params.sku.trim();
  return params.products.some((p) => p.id !== params.currentId && p.sku === target);
}
