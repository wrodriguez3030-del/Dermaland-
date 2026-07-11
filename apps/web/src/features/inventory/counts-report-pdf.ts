// Spec PURO del PDF profesional del Reporte de Inventario Físico (Conteos).
//
// Estado con color (verde coincide / amarillo sobrante / rojo faltante) vía
// `toneKey`. Mismos ítems que la pantalla y el Excel. En landscape se agregan
// Marca, Laboratorio, Sucursal, Lote y Vencimiento (Categoría y Código de barra
// van solo en el Excel por ancho de página).

import type { ReportPdfMeta, ReportPdfSpec, PdfSection } from "@/lib/reports/pdf/types";
import type { InventoryCount, InventoryCountItem } from "@/types";
import type { CountsReportLookups } from "./counts-report-excel";

const ITEM_STATUS_LABEL: Record<string, string> = {
  match: "Coincide",
  shortage: "Faltante",
  overage: "Sobrante",
  expired: "Vencido",
  unregistered: "No registrado",
};
const ITEM_STATUS_TONE: Record<string, "good" | "warn" | "bad"> = {
  match: "good",
  shortage: "bad",
  overage: "warn",
  expired: "bad",
  unregistered: "warn",
};

export function buildCountsPdfSpec(
  counts: InventoryCount[],
  items: InventoryCountItem[],
  meta: ReportPdfMeta,
  lookups: CountsReportLookups = {},
): ReportPdfSpec {
  const branchName = lookups.branchName ?? (() => "");
  const productOf = lookups.product ?? (() => undefined);
  const brandName = lookups.brandName ?? (() => "");
  const labName = lookups.labName ?? (() => "");
  const countBranchId = new Map(counts.map((c) => [c.id, c.branchId]));

  const diffs = items.filter((i) => i.status !== "match");
  const shortages = items.filter((i) => i.status === "shortage").length;
  const overages = items.filter((i) => i.status === "overage").length;
  const unregistered = items.filter((i) => i.status === "unregistered").length;

  const rows = diffs.map((it) => {
    const p = productOf(it.productId);
    return {
      product: it.productName,
      sku: it.productSku,
      brand: brandName(p?.brandId) || "—",
      laboratory: labName(p?.laboratoryId) || "—",
      branch: branchName(countBranchId.get(it.inventoryCountId)) || "—",
      lot: it.lotNumber || "—",
      expires: it.expiresAt ?? null,
      expected: it.expectedQuantity,
      counted: it.countedQuantity,
      diff: it.differenceQuantity,
      status: ITEM_STATUS_LABEL[it.status] ?? it.status,
      _tone: ITEM_STATUS_TONE[it.status] ?? "warn",
    };
  });

  const section: PdfSection = {
    title: "Diferencias detectadas",
    table: {
      columns: [
        { header: "No.", key: "_i", format: "index" },
        { header: "Producto", key: "product", weight: 2 },
        { header: "SKU", key: "sku", weight: 1 },
        { header: "Marca", key: "brand", weight: 1 },
        { header: "Laboratorio", key: "laboratory", weight: 1.2 },
        { header: "Sucursal", key: "branch", weight: 1 },
        { header: "Lote", key: "lot", weight: 0.8 },
        { header: "Vencimiento", key: "expires", format: "date" },
        { header: "Stock", key: "expected", format: "int" },
        { header: "Contado", key: "counted", format: "int" },
        { header: "Dif.", key: "diff", format: "int" },
        { header: "Estado", key: "status", weight: 1, toneKey: "_tone" },
      ],
      rows,
      totals: { product: "TOTAL", diff: diffs.reduce((s, i) => s + i.differenceQuantity, 0) },
      emptyMessage: "Sin diferencias en los inventarios.",
    },
  };

  return {
    meta,
    orientation: "landscape",
    kpis: [
      { label: "Productos revisados", value: items.length, format: "int" },
      { label: "Diferencias", value: diffs.length, format: "int", tone: diffs.length ? "warn" : "good" },
      { label: "Faltantes", value: shortages, format: "int", tone: shortages ? "bad" : "good" },
      { label: "Sobrantes", value: overages, format: "int", tone: overages ? "warn" : "good" },
      { label: "No registrados", value: unregistered, format: "int", tone: unregistered ? "warn" : "good" },
    ],
    sections: [section],
  };
}
