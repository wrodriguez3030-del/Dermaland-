// Spec PURO del Excel profesional del Reporte de Inventario Físico (Conteos).
//
// Usa los MISMOS conteos e ítems que muestra Reportes > Conteos.

import type {
  ReportMeta,
  SheetSpec,
  WorkbookSpec,
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

export function buildCountsWorkbookSpec(
  counts: InventoryCount[],
  items: InventoryCountItem[],
  meta: ReportMeta,
  branchName: (id: string) => string = () => "Sucursal",
): WorkbookSpec {
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
          branch: branchName(c.branchId),
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

  const itemRow = (it: InventoryCountItem) => ({
    product: it.productName,
    sku: it.productSku,
    lot: it.lotNumber ?? "—",
    expected: it.expectedQuantity,
    counted: it.countedQuantity,
    diff: it.differenceQuantity,
    status: ITEM_STATUS_LABEL[it.status] ?? it.status,
    lastScan: it.lastScanAt ? toExcelDate(it.lastScanAt) : null,
  });
  const itemColumns = [
    { header: "Producto", key: "product", width: 42 },
    { header: "SKU", key: "sku", width: 16 },
    { header: "Lote", key: "lot", width: 14 },
    { header: "Stock sistema", key: "expected", format: "int" as const },
    { header: "Cantidad contada", key: "counted", format: "int" as const },
    { header: "Diferencia", key: "diff", format: "int" as const },
    { header: "Estado", key: "status", width: 15 },
    { header: "Último escaneo", key: "lastScan", format: "datetime" as const },
  ];

  const diferencias: SheetSpec = {
    name: "Diferencias",
    tables: [
      {
        columns: itemColumns,
        rows: diffs.map(itemRow),
        totals: {
          product: "TOTAL",
          diff: diffs.reduce((s, i) => s + i.differenceQuantity, 0),
        },
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
