import type { Product, ProductLot } from "@/types";

/** Fila de la tabla "Stock por lote" (presentación + búsqueda/orden). */
export interface LotRow {
  lot: ProductLot;
  product?: Product;
  productName: string;
  sku: string;
  brandName: string;
  labName: string;
  branchName: string;
  /** Días hasta el vencimiento (negativo = vencido). */
  days: number;
  /** current_quantity * unit_cost. */
  value: number;
}

export type LotStatusFilter =
  | "all"
  | "disponible"
  | "sin-stock"
  | "por-vencer"
  | "vencido"
  | "cuarentena"
  | "recall";

export interface LotRowFilters {
  search: string;
  status: LotStatusFilter;
  branchFilter: string; // "all" o branchId
}

/** ¿La fila pasa los filtros? Misma regla de "vendible" que el motor de stock. */
export function lotRowMatches(row: LotRow, f: LotRowFilters): boolean {
  if (f.branchFilter !== "all" && row.lot.branchId !== f.branchFilter) return false;

  if (f.status !== "all") {
    const { status: st, currentQuantity } = row.lot;
    const sellable = st === "available" && currentQuantity > 0 && row.days >= 0;
    if (f.status === "disponible" && !sellable) return false;
    if (f.status === "sin-stock" && currentQuantity !== 0) return false;
    if (f.status === "por-vencer" && !(sellable && row.days < 30)) return false;
    if (f.status === "vencido" && !(st === "expired" || row.days < 0)) return false;
    if (f.status === "cuarentena" && st !== "quarantine") return false;
    if (f.status === "recall" && st !== "recalled") return false;
  }

  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay =
      `${row.productName} ${row.sku} ${row.lot.lotNumber} ${row.brandName} ${row.labName}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Comparadores por columna (para `useTableSort`). Default: cantidad desc. */
export const LOT_COMPARATORS = {
  producto: (a: LotRow, b: LotRow) => a.productName.localeCompare(b.productName),
  lote: (a: LotRow, b: LotRow) => a.lot.lotNumber.localeCompare(b.lot.lotNumber),
  sucursal: (a: LotRow, b: LotRow) => a.branchName.localeCompare(b.branchName),
  cantidad: (a: LotRow, b: LotRow) => a.lot.currentQuantity - b.lot.currentQuantity,
  vence: (a: LotRow, b: LotRow) =>
    +new Date(a.lot.expiresAt) - +new Date(b.lot.expiresAt),
  dias: (a: LotRow, b: LotRow) => a.days - b.days,
  estado: (a: LotRow, b: LotRow) => a.lot.status.localeCompare(b.lot.status),
  valor: (a: LotRow, b: LotRow) => a.value - b.value,
} as const;
