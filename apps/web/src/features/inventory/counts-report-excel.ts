// Spec PURO del Excel profesional del Reporte de Inventario Físico (Conteos).
//
// Usa los MISMOS conteos e ítems que muestra Reportes > Conteos. Las columnas
// descriptivas de ítem (SKU, Código de barra, Producto, Laboratorio, Marca,
// Categoría, Sucursal, Lote, Vencimiento…) siguen el MISMO orden que el Excel
// de detalle por conteo (`physical-count-export.ts`), para coherencia.
//
// El armador es puro: recibe `lookups` para resolver nombres legibles (marca,
// laboratorio, categoría, sucursal) y el barcode a partir del producto, sin
// depender de la fuente de datos. La sucursal por ítem se deriva del conteo al
// que pertenece (`inventoryCountId` → `count.branchId`).

import type {
  ReportMeta,
  SheetSpec,
  WorkbookSpec,
  ColumnSpec,
} from "@/lib/reports/excel/types";
import { toExcelDate } from "@/lib/reports/excel/excel-date";
import type { InventoryCount, InventoryCountItem } from "@/types";

const ITEM_STATUS_LABEL: Record<string, string> = {
  match: "Coincide",
  shortage: "Faltante",
  overage: "Sobrante",
  expired: "Vencido",
  unregistered: "No registrado",
};

const COUNT_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  in_progress: "En progreso",
  submitted: "Enviado",
  in_review: "En revisión",
  approved: "Aprobado",
  cancelled: "Cancelado",
};

/** Producto reducido a lo que el reporte necesita resolver. */
export interface CountsProductLite {
  brandId?: string;
  laboratoryId?: string;
  categoryId?: string;
  barcode?: string;
}

/** Resolutores de nombres legibles (por defecto vacíos → columnas en "—"). */
export interface CountsReportLookups {
  branchName?: (id: string | undefined) => string;
  product?: (id: string) => CountsProductLite | undefined;
  brandName?: (id: string | undefined) => string;
  labName?: (id: string | undefined) => string;
  categoryName?: (id: string | undefined) => string;
}

export function buildCountsWorkbookSpec(
  counts: InventoryCount[],
  items: InventoryCountItem[],
  meta: ReportMeta,
  lookups: CountsReportLookups = {},
): WorkbookSpec {
  const branchName = lookups.branchName ?? (() => "");
  const productOf = lookups.product ?? (() => undefined);
  const brandName = lookups.brandName ?? (() => "");
  const labName = lookups.labName ?? (() => "");
  const categoryName = lookups.categoryName ?? (() => "");
  const countBranchId = new Map(counts.map((c) => [c.id, c.branchId]));

  const diffs = items.filter((i) => i.status !== "match");
  const shortages = items.filter((i) => i.status === "shortage");
  const overages = items.filter((i) => i.status === "overage");
  const expired = items.filter((i) => i.status === "expired");
  const unregistered = items.filter((i) => i.status === "unregistered");
  const approved = counts.filter((c) => c.status === "approved");

  const resumen: SheetSpec = {
    name: "Resumen",
    kpis: [
      { label: "Conteos registrados", value: counts.length, format: "int" },
      { label: "Inventarios aprobados", value: approved.length, format: "int" },
      { label: "Items revisados", value: items.length, format: "int" },
      { label: "Faltantes", value: shortages.length, format: "int" },
      { label: "Sobrantes", value: overages.length, format: "int" },
      { label: "Vencidos detectados", value: expired.length, format: "int" },
      { label: "No registrados", value: unregistered.length, format: "int" },
    ],
    tables: [],
  };

  const conteos: SheetSpec = {
    name: "Conteos",
    tables: [
      {
        columns: [
          { header: "Conteo", key: "number", width: 16 },
          { header: "Sucursal", key: "branch", width: 20 },
          { header: "Tipo", key: "type", width: 12 },
          { header: "Estado", key: "status", width: 14 },
          { header: "Iniciado", key: "startedAt", format: "datetime" },
          { header: "Aprobado", key: "approvedAt", format: "datetime" },
          { header: "Escaneos", key: "scans", format: "int" },
          { header: "Items", key: "items", format: "int" },
        ],
        rows: counts.map((c) => ({
          number: c.countNumber,
          branch: branchName(c.branchId) || "—",
          type: c.countType === "full" ? "Completo" : c.countType === "partial" ? "Parcial" : "Puntual",
          status: COUNT_STATUS_LABEL[c.status] ?? c.status,
          startedAt: c.startedAt ? toExcelDate(c.startedAt) : null,
          approvedAt: c.approvedAt ? toExcelDate(c.approvedAt) : null,
          scans: c.scanCount,
          items: c.itemCount,
        })),
      },
    ],
  };

  const itemRow = (it: InventoryCountItem) => {
    const p = productOf(it.productId);
    return {
      sku: it.productSku || "—",
      barcode: p?.barcode || "—",
      product: it.productName,
      laboratory: labName(p?.laboratoryId) || "—",
      brand: brandName(p?.brandId) || "—",
      category: categoryName(p?.categoryId) || "—",
      branch: branchName(countBranchId.get(it.inventoryCountId)) || "—",
      lot: it.lotNumber ?? "—",
      expires: it.expiresAt ? toExcelDate(it.expiresAt) : null,
      expected: it.expectedQuantity,
      counted: it.countedQuantity,
      diff: it.differenceQuantity,
      status: ITEM_STATUS_LABEL[it.status] ?? it.status,
      lastScan: it.lastScanAt ? toExcelDate(it.lastScanAt) : null,
    };
  };
  // Mismo orden de columnas descriptivas que el Excel de detalle por conteo.
  const itemColumns: ColumnSpec[] = [
    { header: "SKU", key: "sku", width: 16 },
    { header: "Código de barra", key: "barcode", width: 16 },
    { header: "Producto", key: "product", width: 42 },
    { header: "Laboratorio", key: "laboratory", width: 18 },
    { header: "Marca", key: "brand", width: 16 },
    { header: "Categoría", key: "category", width: 16 },
    { header: "Sucursal", key: "branch", width: 18 },
    { header: "Lote", key: "lot", width: 14 },
    { header: "Vencimiento", key: "expires", format: "date" },
    { header: "Stock sistema", key: "expected", format: "int" },
    { header: "Cantidad contada", key: "counted", format: "int" },
    { header: "Diferencia", key: "diff", format: "int" },
    { header: "Estado", key: "status", width: 15 },
    { header: "Último escaneo", key: "lastScan", format: "datetime" },
  ];

  const diferencias: SheetSpec = {
    name: "Diferencias",
    tables: [
      {
        columns: itemColumns,
        rows: diffs.map(itemRow),
        totals: { diff: diffs.reduce((s, i) => s + i.differenceQuantity, 0) },
      },
    ],
  };

  const noEncontrados: SheetSpec = {
    name: "No encontrados",
    tables: [{ columns: itemColumns, rows: unregistered.map(itemRow) }],
  };

  const detalle: SheetSpec = {
    name: "Detalle",
    tables: [{ columns: itemColumns, rows: items.map(itemRow) }],
  };

  return { meta, sheets: [resumen, conteos, diferencias, noEncontrados, detalle] };
}
