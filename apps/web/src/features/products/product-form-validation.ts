// Validación PURA del formulario de producto (Nuevo / Editar). Testeable sin
// React. Devuelve las CLAVES de los campos requeridos/ inválidos; la UI las
// resalta y muestra el mensaje específico (`PRODUCT_FIELD_MESSAGES`). El SKU no
// se valida (lo genera el sistema). El ITBIS 0% (Exento) es válido.

import { isValidCost, isValidItbis, isValidMargin } from "./pricing";

/** Modo de precio: sugerido automático vs override manual (ADMIN). */
export type PriceMode = "auto" | "manual";

export interface ProductFormValues {
  name: string;
  /** Costo por unidad (DOP) como string del input. */
  cost: string;
  itbisRate: string;
  /** Margen de ganancia (%) como string del input. */
  margin: string;
  priceMode: PriceMode;
  /** Precio de venta EFECTIVO (auto-calculado o manual) como string. */
  price: string;
  unit: string;
  /** Checkbox "Crear un lote inicial junto con el producto". */
  withLot: boolean;
  lotBranch: string;
  lotNumber: string;
  lotQty: string;
  lotExpiry: string;
}

/**
 * Mensajes ESPECÍFICOS por campo (§12): nunca "Complete los campos requeridos"
 * a secas. La UI usa este mapa tanto en el banner como en el error inline.
 */
export const PRODUCT_FIELD_MESSAGES: Record<string, string> = {
  name: "Ingresa el nombre comercial.",
  cost: "Ingresa el costo por unidad.",
  itbisRate: "Selecciona el ITBIS.",
  margin: "Ingresa un margen válido.",
  price: "Ingresa un precio de venta válido.",
  manualReason: "Indica el motivo del precio manual.",
  unit: "Ingresa la unidad.",
  branchId: "Selecciona la sucursal del lote inicial.",
  lotNumber: "Ingresa el número de lote.",
  initialQuantity: "Ingresa la cantidad inicial.",
  expiresAt: "Ingresa la fecha de vencimiento.",
};

export function validateProductForm(v: ProductFormValues): string[] {
  const m: string[] = [];
  if (!v.name.trim()) m.push("name");

  // Costo por unidad: requerido, numérico y >= 0 (no negativo, no NaN/Inf).
  const cost = Number(v.cost);
  if (v.cost.trim() === "" || !isValidCost(cost)) m.push("cost");

  // ITBIS: requerido y oficial (0/16/18). 0% (Exento) es válido.
  const itbis = Number(v.itbisRate);
  if (v.itbisRate.trim() === "" || !isValidItbis(itbis)) m.push("itbisRate");

  // Margen: requerido y válido (0..1000, decimales permitidos).
  const margin = Number(v.margin);
  if (v.margin.trim() === "" || !isValidMargin(margin)) m.push("margin");

  // Precio de venta efectivo: nunca negativo / NaN / infinito.
  const price = Number(v.price);
  const priceInvalid = !Number.isFinite(price) || price < 0;
  if (v.priceMode === "manual") {
    if (v.price.trim() === "" || priceInvalid) m.push("price");
  } else if (priceInvalid) {
    // En modo auto el precio se calcula; solo falla si resultó no-finito/negativo.
    m.push("price");
  }

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
