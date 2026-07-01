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
