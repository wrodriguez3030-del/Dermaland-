/**
 * MOTOR ÚNICO DE STOCK — fuente de verdad compartida por POS, Productos,
 * Inventario (Stock actual), Stock por lote, Vencimientos, Cuarentena, etc.
 *
 * Todas las funciones son PURAS: reciben los lotes ya cargados (de `useAllLots()`,
 * que en Supabase trae `product_lots` reales por RLS/business_id) y calculan
 * stock por SUCURSAL. Un lote es vendible si: `current_quantity > 0`,
 * `status` disponible, NO vencido, NO cuarentena, NO recall, `branch_id` correcto.
 *
 * REGLA: ninguna pantalla debe recalcular stock por su cuenta ni filtrar lotes
 * con `onlyActiveBranches` (que lee el store mock síncrono y, en Supabase, borra
 * todos los lotes reales). Se usa el `branchId` seleccionado directamente.
 */
import type { Product, ProductLot } from "@/types";
import {
  sellableStockForBranch,
  stockByBranchForProduct,
  totalSellableStock,
  nextFefoLotForBranch,
  fefoLotsForBranch,
  inventoryRowForBranch,
  type InventoryRow,
} from "./lot-store";

// ── Nombres canónicos del motor ──────────────────────────────────────────────
export const getSellableStockForBranch = sellableStockForBranch;
export const getStockByBranch = stockByBranchForProduct;
export const getTotalStockAcrossActiveBranches = totalSellableStock;
export const getNextSellableLotFEFO = nextFefoLotForBranch;
export const getFefoLotsForBranch = fefoLotsForBranch;
export { inventoryRowForBranch };
export type { InventoryRow };

export interface ProductStockRow {
  product: Product;
  inv: InventoryRow;
  /** Números de lote del producto en la sucursal (para búsqueda). */
  lotNumbers: string[];
}

/**
 * Filas de stock por producto en una sucursal (motor de Inventario > Stock
 * actual). Agrupa lotes por producto una sola vez → O(L + P).
 */
export function getInventoryRows(
  lots: ProductLot[],
  products: Product[],
  branchId: string,
): ProductStockRow[] {
  const byProduct = new Map<string, ProductLot[]>();
  for (const l of lots) {
    if (branchId && l.branchId !== branchId) continue;
    const arr = byProduct.get(l.productId);
    if (arr) arr.push(l);
    else byProduct.set(l.productId, [l]);
  }
  return products.map((p) => {
    const pLots = byProduct.get(p.id) ?? [];
    return {
      product: p,
      inv: inventoryRowForBranch(pLots, p.id, branchId),
      lotNumbers: pLots.map((l) => l.lotNumber),
    };
  });
}

export interface InventorySummary {
  totalUnits: number;
  totalValue: number;
  lowStockCount: number;
  noStockCount: number;
}

/**
 * Totales de Stock actual a partir de las filas (unidades vendibles, valor,
 * bajo mínimo, sin stock).
 */
export function getInventoryStockSummary(
  rows: { product: { minStock: number }; inv: InventoryRow }[],
): InventorySummary {
  let totalUnits = 0;
  let totalValue = 0;
  let lowStockCount = 0;
  let noStockCount = 0;
  for (const r of rows) {
    totalUnits += r.inv.sellableStock;
    totalValue += r.inv.value;
    if (r.inv.sellableStock <= r.product.minStock) lowStockCount += 1;
    if (r.inv.sellableStock === 0) noStockCount += 1;
  }
  return { totalUnits, totalValue, lowStockCount, noStockCount };
}
