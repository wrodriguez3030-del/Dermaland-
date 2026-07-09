// Spec PURO del Excel profesional del Reporte de Productos.
//
// Usa los MISMOS agregados que muestra Reportes > Productos (ventas por
// producto solo de facturas no anuladas, stock vendible, baja rotación)
// + catálogo completo con marca/categoría/laboratorio/margen.

import type {
  ReportMeta,
  SheetSpec,
  TableSpec,
  WorkbookSpec,
} from "@/lib/reports/excel/types";
import type { Product } from "@/types";
import { costWithItbis, marginAmount, realMarginPercent } from "./pricing";

export interface ProductSalesTop {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
}

export interface ProductsWorkbookInput {
  products: Product[];
  top: ProductSalesTop[];
  lowRotation: { p: Product; stock: number }[];
  stockByProduct: Map<string, number>;
  brandName: (id: string | undefined) => string;
  categoryName: (id: string | undefined) => string;
  laboratoryName: (id: string | undefined) => string;
}

function groupSalesBy(
  input: ProductsWorkbookInput,
  keyOf: (p: Product | undefined) => string,
): { name: string; qty: number; revenue: number }[] {
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const acc = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const t of input.top) {
    const name = keyOf(byId.get(t.productId));
    const e = acc.get(name) ?? { name, qty: 0, revenue: 0 };
    e.qty += t.qty;
    e.revenue += t.revenue;
    acc.set(name, e);
  }
  return [...acc.values()].sort((a, b) => b.revenue - a.revenue);
}

function groupTable(
  rows: { name: string; qty: number; revenue: number }[],
  header: string,
): TableSpec {
  return {
    columns: [
      { header, key: "name", width: 34 },
      { header: "Unidades", key: "qty", format: "int" },
      { header: "Ingreso", key: "revenue", format: "currency" },
    ],
    rows: rows.map((r) => ({ ...r })),
    totals: {
      name: "TOTAL",
      qty: rows.reduce((s, r) => s + r.qty, 0),
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
    },
  };
}

export function buildProductsWorkbookSpec(
  input: ProductsWorkbookInput,
  meta: ReportMeta,
): WorkbookSpec {
  const unitsSold = input.top.reduce((s, t) => s + t.qty, 0);
  const revenue = input.top.reduce((s, t) => s + t.revenue, 0);

  const ventasTable: TableSpec = {
    columns: [
      { header: "Producto", key: "name", width: 46 },
      { header: "Cantidad", key: "qty", format: "int" },
      { header: "Ingreso", key: "revenue", format: "currency" },
    ],
    rows: input.top.map((t) => ({ name: t.name, qty: t.qty, revenue: t.revenue })),
    totals: { name: "TOTAL", qty: unitsSold, revenue },
  };

  const resumen: SheetSpec = {
    name: "Resumen",
    kpis: [
      { label: "Productos en catálogo", value: input.products.length, format: "int" },
      { label: "Productos vendidos", value: input.top.length, format: "int" },
      { label: "Unidades vendidas", value: unitsSold, format: "int" },
      { label: "Ingreso por productos", value: revenue, format: "currency" },
      { label: "Baja rotación (stock sin ventas)", value: input.lowRotation.length, format: "int" },
    ],
    tables: [
      {
        ...ventasTable,
        title: "Top 20 por ingreso",
        rows: ventasTable.rows.slice(0, 20),
        totals: undefined,
      },
    ],
  };

  const catalogo: SheetSpec = {
    name: "Catálogo",
    tables: [
      {
        columns: [
          { header: "Producto", key: "name", width: 46 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Marca", key: "brand", width: 18 },
          { header: "Categoría", key: "category", width: 18 },
          { header: "Laboratorio", key: "lab", width: 18 },
          { header: "Costo por unidad", key: "cost", format: "currency" },
          { header: "ITBIS %", key: "itbis", format: "percent" },
          { header: "Costo con ITBIS", key: "costWithItbis", format: "currency" },
          { header: "Precio venta", key: "price", format: "currency" },
          { header: "Margen real", key: "realMargin", format: "percent" },
          { header: "Utilidad estimada", key: "utility", format: "currency" },
          { header: "Stock total", key: "stock", format: "int" },
          { header: "Estado", key: "state", width: 12 },
        ],
        rows: input.products.map((p) => {
          const real = realMarginPercent(p.price, p.cost, p.itbisRate);
          return {
            name: p.name,
            sku: p.sku,
            brand: input.brandName(p.brandId),
            category: input.categoryName(p.categoryId),
            lab: input.laboratoryName(p.laboratoryId),
            cost: p.cost,
            // percent muestra 0-1: itbisRate es 18 (=18%) → 0.18.
            itbis: p.itbisRate / 100,
            costWithItbis: costWithItbis(p.cost, p.itbisRate),
            price: p.price,
            // Margen real (%) como proporción para el formato percent (0.30 = 30%).
            realMargin: (real ?? 0) / 100,
            utility: marginAmount(p.price, p.cost, p.itbisRate),
            stock: input.stockByProduct.get(p.id) ?? 0,
            state: (input.stockByProduct.get(p.id) ?? 0) > 0 ? "Con stock" : "Sin stock",
          };
        }),
      },
    ],
  };

  const ventas: SheetSpec = { name: "Ventas por producto", tables: [ventasTable] };

  const bajaRotacion: SheetSpec = {
    name: "Baja rotación",
    tables: [
      {
        columns: [
          { header: "Producto", key: "name", width: 46 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Stock", key: "stock", format: "int" },
        ],
        rows: input.lowRotation.map(({ p, stock }) => ({
          name: p.name,
          sku: p.sku,
          stock,
        })),
      },
    ],
  };

  const marcas: SheetSpec = {
    name: "Marcas",
    tables: [groupTable(groupSalesBy(input, (p) => input.brandName(p?.brandId)), "Marca")],
  };
  const categorias: SheetSpec = {
    name: "Categorías",
    tables: [
      groupTable(groupSalesBy(input, (p) => input.categoryName(p?.categoryId)), "Categoría"),
    ],
  };
  const laboratorios: SheetSpec = {
    name: "Laboratorios",
    tables: [
      groupTable(
        groupSalesBy(input, (p) => input.laboratoryName(p?.laboratoryId)),
        "Laboratorio",
      ),
    ],
  };

  return {
    meta,
    sheets: [resumen, catalogo, ventas, bajaRotacion, marcas, categorias, laboratorios],
  };
}
