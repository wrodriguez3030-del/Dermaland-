// Spec PURO del PDF profesional del Reporte de Productos (catálogo).
//
// Mismos datos que la pantalla y el Excel.

import type { ReportPdfMeta, ReportPdfSpec, PdfSection } from "@/lib/reports/pdf/types";
import type { ProductsWorkbookInput } from "./products-report-excel";

export function buildProductsPdfSpec(
  input: ProductsWorkbookInput,
  meta: ReportPdfMeta,
  counts: { brands: number; categories: number; laboratories: number },
): ReportPdfSpec {
  const catalogo: PdfSection = {
    title: "Catálogo de productos",
    table: {
      columns: [
        { header: "No.", key: "_i", format: "index" },
        { header: "Producto", key: "name", weight: 2.2 },
        { header: "SKU", key: "sku", weight: 1 },
        { header: "Marca", key: "brand", weight: 1.1 },
        { header: "Categoría", key: "category", weight: 1.1 },
        { header: "Laboratorio", key: "lab", weight: 1.1 },
        { header: "Precio", key: "price", format: "currency" },
        { header: "Stock", key: "stock", format: "int" },
      ],
      rows: input.products.map((p) => ({
        name: p.name,
        sku: p.sku,
        brand: input.brandName(p.brandId),
        category: input.categoryName(p.categoryId),
        lab: input.laboratoryName(p.laboratoryId),
        price: p.price,
        stock: input.stockByProduct.get(p.id) ?? 0,
      })),
      emptyMessage: "Sin productos en el catálogo.",
    },
  };

  return {
    meta,
    orientation: "landscape",
    kpis: [
      { label: "Productos en catálogo", value: input.products.length, format: "int" },
      { label: "Marcas", value: counts.brands, format: "int" },
      { label: "Categorías", value: counts.categories, format: "int" },
      { label: "Laboratorios", value: counts.laboratories, format: "int" },
    ],
    sections: [catalogo],
  };
}
