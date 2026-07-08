// Spec PURO del PDF profesional del Reporte de Inventario.
//
// Sigue el layout del PDF de referencia (INVENTARIO DE PRODUCTOS): KPIs +
// tabla de existencias por producto (orden stock desc) + secciones de alerta.
// Usa los MISMOS agregados que la pantalla y el Excel → valor coincide.

import type { ReportPdfMeta, ReportPdfSpec, PdfSection } from "@/lib/reports/pdf/types";
import type { InventoryWorkbookInput } from "./inventory-report-excel";

export function buildInventoryPdfSpec(
  input: InventoryWorkbookInput,
  meta: ReportPdfMeta,
): ReportPdfSpec {
  // Existencias: solo productos con stock > 0, orden stock desc (como referencia).
  const existences = input.detail
    .filter((r) => r.stock > 0)
    .sort((a, b) => b.stock - a.stock);

  const existencias: PdfSection = {
    title: undefined,
    table: {
      columns: [
        { header: "No.", key: "_i", format: "index" },
        { header: "Producto", key: "name", weight: 2.4 },
        { header: "Precio venta", key: "price", format: "currency" },
        { header: "Existencia", key: "stock", format: "int" },
        { header: "Valor", key: "value", format: "currency" },
      ],
      rows: existences.map((r) => ({
        name: r.product.name,
        price: r.product.price,
        stock: r.stock,
        value: r.value,
      })),
      totals: {
        name: "TOTAL",
        stock: input.kpis.totalUnits,
        value: input.kpis.totalValue,
      },
      emptyMessage: "Sin existencias registradas.",
    },
    footnote:
      "Se muestran exclusivamente productos activos con existencia mayor a cero en la sucursal.",
  };

  const sections: PdfSection[] = [existencias];

  if (input.lowStock.length > 0) {
    sections.push({
      title: "Productos con bajo stock",
      table: {
        columns: [
          { header: "No.", key: "_i", format: "index" },
          { header: "Producto", key: "name", weight: 2.4 },
          { header: "SKU", key: "sku", weight: 1 },
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
    });
  }

  if (input.expiringLots.length > 0 || input.expiredLots.length > 0) {
    sections.push({
      title: "Próximos vencimientos y lotes vencidos",
      table: {
        columns: [
          { header: "Producto", key: "product", weight: 2.2 },
          { header: "Lote", key: "lot", weight: 1 },
          { header: "Sucursal", key: "branch", weight: 1.2 },
          { header: "Cantidad", key: "qty", format: "int" },
          { header: "Vence", key: "expires", format: "date" },
          { header: "Días", key: "days", format: "int" },
        ],
        rows: [...input.expiringLots, ...input.expiredLots].map((l) => ({
          product: input.productName(l.productId),
          lot: l.lotNumber,
          branch: input.branchName(l.branchId),
          qty: l.currentQuantity,
          expires: l.expiresAt,
          days: input.daysUntil(l.expiresAt),
        })),
      },
    });
  }

  return {
    meta,
    orientation: "portrait",
    kpis: [
      { label: "Productos con existencia", value: existences.length, format: "int" },
      { label: "Unidades totales", value: input.kpis.totalUnits, format: "int" },
      { label: "Valor de inventario", value: input.kpis.totalValue, format: "currency" },
    ],
    sections,
  };
}
