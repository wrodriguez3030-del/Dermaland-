// Spec PURO del Excel profesional del Reporte de Inventario.
//
// Recibe los MISMOS agregados que renderiza la pantalla de
// Reportes > Inventario (mismas reglas de lote vendible, mismos KPIs) y los
// proyecta a un WorkbookSpec del motor central. Sin ExcelJS aquí: testeable.

import type {
  ReportMeta,
  SheetSpec,
  TableSpec,
  WorkbookSpec,
} from "@/lib/reports/excel/types";
import { toExcelDate } from "@/lib/reports/excel/excel-date";
import type { InventoryMovement, Product, ProductLot } from "@/types";

export interface InventoryDetailRow {
  product: Product;
  stock: number;
  value: number;
}

export interface InventoryBranchRow {
  name: string;
  units: number;
  value: number;
}

export interface InventoryWorkbookInput {
  /** Detalle por producto (misma lista que la pantalla, orden por valor). */
  detail: InventoryDetailRow[];
  byBranch: InventoryBranchRow[];
  lowStock: InventoryDetailRow[];
  noStock: InventoryDetailRow[];
  expiringLots: ProductLot[];
  expiredLots: ProductLot[];
  movements: InventoryMovement[];
  /** Todos los lotes (para Stock por lote / Cuarentena / Recall). */
  lots: ProductLot[];
  productName: (id: string) => string;
  branchName: (id: string) => string;
  movementLabel: (type: string) => string;
  daysUntil: (iso: string) => number;
  kpis: {
    skus: number;
    totalUnits: number;
    totalValue: number;
    branches: number;
  };
}

const LOT_STATUS_LABEL: Record<string, string> = {
  available: "Disponible",
  quarantine: "Cuarentena",
  expired: "Vencido",
  recalled: "Recall",
  damaged: "Dañado",
  returned: "Devuelto",
};

function stockStateLabel(r: InventoryDetailRow): string {
  if (r.stock === 0) return "Agotado";
  if (r.stock < r.product.minStock) return "Bajo";
  return "OK";
}

function lotTable(
  input: InventoryWorkbookInput,
  lots: ProductLot[],
  title?: string,
): TableSpec {
  return {
    title,
    columns: [
      { header: "Producto", key: "product", width: 42 },
      { header: "Lote", key: "lot", width: 16 },
      { header: "Sucursal", key: "branch", width: 20 },
      { header: "Cantidad", key: "qty", format: "int" },
      { header: "Costo unitario", key: "cost", format: "currency" },
      { header: "Valor", key: "value", format: "currency" },
      { header: "Vence", key: "expires", format: "date" },
      { header: "Estado", key: "status", width: 14 },
    ],
    rows: lots.map((l) => ({
      product: input.productName(l.productId),
      lot: l.lotNumber,
      branch: input.branchName(l.branchId),
      qty: l.currentQuantity,
      cost: l.unitCost,
      value: l.currentQuantity * l.unitCost,
      expires: toExcelDate(l.expiresAt),
      status: LOT_STATUS_LABEL[l.status] ?? l.status,
    })),
    totals: {
      product: "TOTAL",
      qty: lots.reduce((s, l) => s + l.currentQuantity, 0),
      value: lots.reduce((s, l) => s + l.currentQuantity * l.unitCost, 0),
    },
  };
}

export function buildInventoryWorkbookSpec(
  input: InventoryWorkbookInput,
  meta: ReportMeta,
): WorkbookSpec {
  const quarantineLots = input.lots.filter((l) => l.status === "quarantine");
  const recalledLots = input.lots.filter((l) => l.status === "recalled");

  const resumen: SheetSpec = {
    name: "Resumen",
    kpis: [
      { label: "Productos (SKUs)", value: input.kpis.skus, format: "int" },
      { label: "Unidades disponibles", value: input.kpis.totalUnits, format: "int" },
      { label: "Valor de inventario", value: input.kpis.totalValue, format: "currency" },
      { label: "Sucursales", value: input.kpis.branches, format: "int" },
      { label: "Productos bajo mínimo", value: input.lowStock.length, format: "int" },
      { label: "Productos sin stock", value: input.noStock.length, format: "int" },
      { label: "Lotes próximos a vencer (90 días)", value: input.expiringLots.length, format: "int" },
      { label: "Lotes vencidos", value: input.expiredLots.length, format: "int" },
      { label: "Lotes en cuarentena", value: quarantineLots.length, format: "int" },
      { label: "Lotes en recall", value: recalledLots.length, format: "int" },
    ],
    tables: [
      {
        title: "Stock por sucursal",
        columns: [
          { header: "Sucursal", key: "name", width: 26 },
          { header: "Unidades", key: "units", format: "int" },
          { header: "Valor", key: "value", format: "currency" },
        ],
        rows: input.byBranch.map((b) => ({ ...b })),
        totals: {
          name: "TOTAL",
          units: input.byBranch.reduce((s, b) => s + b.units, 0),
          value: input.byBranch.reduce((s, b) => s + b.value, 0),
        },
      },
    ],
  };

  const stockActual: SheetSpec = {
    name: "Stock actual",
    tables: [
      {
        columns: [
          { header: "Producto", key: "name", width: 46 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Stock", key: "stock", format: "int" },
          { header: "Mínimo", key: "min", format: "int" },
          { header: "Valor", key: "value", format: "currency" },
          { header: "Estado", key: "state", width: 12 },
        ],
        rows: input.detail.map((r) => ({
          name: r.product.name,
          sku: r.product.sku,
          stock: r.stock,
          min: r.product.minStock,
          value: r.value,
          state: stockStateLabel(r),
        })),
        totals: {
          name: "TOTAL",
          stock: input.kpis.totalUnits,
          value: input.kpis.totalValue,
        },
      },
    ],
  };

  const porLote: SheetSpec = {
    name: "Stock por lote",
    tables: [lotTable(input, input.lots.filter((l) => l.currentQuantity > 0))],
  };

  const vencimientos: SheetSpec = {
    name: "Vencimientos",
    tables: [
      {
        title: "Próximos a vencer (90 días)",
        columns: [
          { header: "Producto", key: "product", width: 42 },
          { header: "Lote", key: "lot", width: 16 },
          { header: "Sucursal", key: "branch", width: 20 },
          { header: "Cantidad", key: "qty", format: "int" },
          { header: "Vence", key: "expires", format: "date" },
          { header: "Días restantes", key: "days", format: "int" },
        ],
        rows: input.expiringLots.map((l) => ({
          product: input.productName(l.productId),
          lot: l.lotNumber,
          branch: input.branchName(l.branchId),
          qty: l.currentQuantity,
          expires: toExcelDate(l.expiresAt),
          days: input.daysUntil(l.expiresAt),
        })),
      },
      lotTable(input, input.expiredLots, "Lotes vencidos"),
    ],
  };

  const bajoStock: SheetSpec = {
    name: "Bajo stock",
    tables: [
      {
        title: "Bajo mínimo",
        columns: [
          { header: "Producto", key: "name", width: 46 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Stock", key: "stock", format: "int" },
          { header: "Mínimo", key: "min", format: "int" },
        ],
        rows: input.lowStock.map((r) => ({
          name: r.product.name,
          sku: r.product.sku,
          stock: r.stock,
          min: r.product.minStock,
        })),
      },
      {
        title: "Sin stock",
        columns: [
          { header: "Producto", key: "name", width: 46 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Mínimo", key: "min", format: "int" },
        ],
        rows: input.noStock.map((r) => ({
          name: r.product.name,
          sku: r.product.sku,
          min: r.product.minStock,
        })),
      },
    ],
  };

  const movimientos: SheetSpec = {
    name: "Movimientos",
    tables: [
      {
        columns: [
          { header: "Fecha", key: "date", format: "datetime" },
          { header: "Tipo", key: "type", width: 16 },
          { header: "Producto", key: "product", width: 42 },
          { header: "Cantidad", key: "qty", format: "int" },
          { header: "Sucursal", key: "branch", width: 20 },
          { header: "Usuario", key: "user", width: 22 },
        ],
        rows: input.movements.map((m) => ({
          date: toExcelDate(m.createdAt),
          type: input.movementLabel(m.type),
          product: input.productName(m.productId),
          qty: m.quantity,
          branch: input.branchName(m.branchId),
          user: m.userName,
        })),
      },
    ],
  };

  const cuarentena: SheetSpec = {
    name: "Cuarentena",
    tables: [lotTable(input, quarantineLots)],
  };
  const recall: SheetSpec = {
    name: "Recall",
    tables: [lotTable(input, recalledLots)],
  };

  return {
    meta,
    sheets: [
      resumen,
      stockActual,
      porLote,
      vencimientos,
      bajoStock,
      movimientos,
      cuarentena,
      recall,
    ],
  };
}
