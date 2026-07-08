// Spec PURO del PDF profesional del Reporte de Inventario Físico (Conteos).
//
// Estado con color (verde coincide / amarillo sobrante / rojo faltante) vía
// `toneKey`. Mismos ítems que la pantalla y el Excel.

import type { ReportPdfMeta, ReportPdfSpec, PdfSection } from "@/lib/reports/pdf/types";
import type { InventoryCountItem } from "@/types";

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
  items: InventoryCountItem[],
  meta: ReportPdfMeta,
): ReportPdfSpec {
  const diffs = items.filter((i) => i.status !== "match");
  const shortages = items.filter((i) => i.status === "shortage").length;
  const overages = items.filter((i) => i.status === "overage").length;
  const unregistered = items.filter((i) => i.status === "unregistered").length;

  const rows = diffs.map((it) => ({
    product: it.productName,
    sku: it.productSku,
    expected: it.expectedQuantity,
    counted: it.countedQuantity,
    diff: it.differenceQuantity,
    status: ITEM_STATUS_LABEL[it.status] ?? it.status,
    _tone: ITEM_STATUS_TONE[it.status] ?? "warn",
  }));

  const section: PdfSection = {
    title: "Diferencias detectadas",
    table: {
      columns: [
        { header: "No.", key: "_i", format: "index" },
        { header: "Producto", key: "product", weight: 2.2 },
        { header: "SKU", key: "sku", weight: 1 },
        { header: "Stock sistema", key: "expected", format: "int" },
        { header: "Conteo físico", key: "counted", format: "int" },
        { header: "Diferencia", key: "diff", format: "int" },
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
