/**
 * Convierte el inventario por almacén de Alegra en las filas que entiende el
 * motor del importador (`buildImportPlan`): `qtyPrincipal` = almacén "1",
 * `qtyTotal` = "1" + "2".
 *
 * Se usa el NOMBRE DE DERMALAND del producto ya emparejado (por eso recibe
 * `nameForAlegraId`): el motor empareja por nombre normalizado, así que no
 * puede depender de que Alegra y DermaLand escriban igual — el emparejado real
 * lo hizo antes `plan-products` por `alegra_id`.
 *
 * Las cantidades se truncan a entero ≥ 0: el motor rechaza negativos y
 * decimales, y una existencia negativa en Alegra no debe frenar el resto.
 */
import type { AlegraRow } from "@/features/inventory/alegra-import";
import type { AlegraItem } from "./types";

/** Almacén «Principal» de Alegra → sucursal DermaLand Principal. */
export const ALEGRA_WAREHOUSE_PRINCIPAL = "1";
/** Almacén «CUTIS» de Alegra → sucursal Dermaland  Villa Olga. */
export const ALEGRA_WAREHOUSE_SEGUNDA = "2";

const entero = (n: unknown): number => Math.max(0, Math.trunc(Number(n) || 0));

export function stockRowsFromItems(
  items: AlegraItem[],
  nameForAlegraId: (alegraId: string) => string | undefined,
): AlegraRow[] {
  const rows: AlegraRow[] = [];
  for (const item of items) {
    const name = nameForAlegraId(String(item.id));
    const bodegas = item.inventory?.warehouses;
    if (!name || !bodegas) continue;
    const principal = entero(bodegas.find((w) => String(w.id) === ALEGRA_WAREHOUSE_PRINCIPAL)?.availableQuantity);
    const segunda = entero(bodegas.find((w) => String(w.id) === ALEGRA_WAREHOUSE_SEGUNDA)?.availableQuantity);
    rows.push({ rowNumber: rows.length + 1, name, qtyPrincipal: principal, qtyTotal: principal + segunda });
  }
  return rows;
}
