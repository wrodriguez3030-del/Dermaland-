// Exportación del reporte de ventas a Excel (.xlsx, multi-hoja) y CSV.
//
// Presentación pura con SheetJS en memoria (sin red ni fs). Devuelve bytes
// (Uint8Array) y texto CSV; la descarga al navegador la hace la página. NO toca
// DGII real, secuencias ni datos: solo formatea lo que ya está en pantalla.
//
// Nota: la edición community de SheetJS no escribe estilos de celda (negrita)
// ni paneles congelados; sí soporta anchos de columna y formato de moneda, que
// es lo que aplicamos para que el archivo se lea profesional.

import * as XLSX from "xlsx";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import type {
  SalesReport,
  SalesTableRow,
} from "./sales-report";

const MONEY_FMT = '"RD$"#,##0.00';
const PCT_FMT = "0.00%";

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Aplica un formato numérico a UNA celda si contiene un número. */
function applyCellFmt(
  ws: XLSX.WorkSheet,
  row: number,
  col: number,
  fmt: string,
): void {
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = ws[ref];
  if (cell && typeof cell.v === "number") {
    cell.t = "n";
    cell.z = fmt;
  }
}

export interface SalesReportMeta {
  businessName: string;
  generatedAt: string;
  /** Texto del rango de fechas, p. ej. "2026-06-01 a 2026-06-29" o "Todo". */
  rangeLabel: string;
  /** Sucursal filtrada, p. ej. "Todas las sucursales". */
  branchLabel: string;
  /** Resumen legible de los filtros activos. */
  filtersLabel: string;
}

type Cell = string | number | null;

/** Marca columnas (0-based) como moneda en todas las filas de datos. */
function applyMoney(
  ws: XLSX.WorkSheet,
  aoa: Cell[][],
  moneyCols: number[],
  startRow: number,
): void {
  for (let r = startRow; r < aoa.length; r++) {
    for (const c of moneyCols) {
      const value = aoa[r]?.[c];
      if (typeof value !== "number") continue;
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (cell) {
        cell.t = "n";
        cell.z = MONEY_FMT;
      }
    }
  }
}

function sheetFromAoa(
  aoa: Cell[][],
  widths: number[],
  moneyCols: number[] = [],
  moneyStartRow = 1,
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  if (moneyCols.length) applyMoney(ws, aoa, moneyCols, moneyStartRow);
  return ws;
}

// ─── Hoja 1: Resumen ─────────────────────────────────────────────────────────

function resumenSheet(report: SalesReport, meta: SalesReportMeta): XLSX.WorkSheet {
  const k = report.kpis;
  const methods = report.methods;
  const totalMethods = r2(methods.reduce((s, m) => s + m.amount, 0));
  const totalPayments = methods.reduce((s, m) => s + m.count, 0);

  const aoa: Cell[][] = [
    [meta.businessName || "DermaLand", null, null, null],
    ["Reporte de ventas", null, null, null],
    ["", null, null, null],
    ["Rango", meta.rangeLabel, null, null],
    ["Sucursal", meta.branchLabel, null, null],
    ["Filtros", meta.filtersLabel, null, null],
    ["Generado", formatDateTime(meta.generatedAt), null, null],
    ["", null, null, null],
    ["Total facturado", k.totalBilled, null, null],
    ["ITBIS recaudado", k.itbis, null, null],
    ["Transacciones", k.transactions, null, null],
    ["Items vendidos", k.items, null, null],
    ["Ticket promedio", k.avgTicket, null, null],
    ["Clientes distintos", k.distinctCustomers, null, null],
    ["Descuentos otorgados", k.discounts, null, null],
    ["Devoluciones", k.refunds, null, null],
    ["Neto después de devoluciones", k.net, null, null],
    ["Margen estimado", k.marginEstimate ?? "N/D", null, null],
    ["", null, null, null],
    ["MÉTODOS DE PAGO", null, null, null],
    ["Método", "Transacciones", "Monto", "Porcentaje"],
  ];
  const moneyRowsCol1 = new Set([8, 9, 12, 14, 15, 16, 17]); // KPIs en moneda
  const methodStart = aoa.length;
  for (const m of methods) {
    aoa.push([m.label, m.count, m.amount, totalMethods > 0 ? m.amount / totalMethods : 0]);
  }
  aoa.push(["TOTAL", totalPayments, totalMethods, totalMethods > 0 ? 1 : 0]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 18 }, { wch: 14 }];
  for (const r of moneyRowsCol1) applyCellFmt(ws, r, 1, MONEY_FMT);
  for (let r = methodStart; r < aoa.length; r++) {
    applyCellFmt(ws, r, 2, MONEY_FMT);
    applyCellFmt(ws, r, 3, PCT_FMT);
  }
  return ws;
}

// ─── Hoja 2: Ventas detalle ──────────────────────────────────────────────────

const DETAIL_HEADERS = [
  "Fecha y hora",
  "Sucursal",
  "Comprobante",
  "Tipo documento",
  "Cliente",
  "Cajero",
  "Items",
  "Método de pago",
  "Subtotal",
  "ITBIS",
  "Descuento",
  "Total",
  "Estado",
];

/**
 * Etiqueta del método de pago para el detalle: para ventas mixtas desglosa cada
 * pago real, p. ej. "Mixto: Efectivo RD$100.00 + Tarjeta RD$50.00".
 */
function detailMethodLabel(r: SalesTableRow): string {
  if (r.method !== "mixed") return r.methodLabel;
  const parts = r.methodParts.map((pt) => `${pt.label} ${formatCurrency(pt.amount)}`);
  return parts.length ? `Mixto: ${parts.join(" + ")}` : r.methodLabel;
}

function detailRow(r: SalesTableRow): Cell[] {
  return [
    formatDateTime(r.dateTime),
    r.branchName,
    r.comprobante,
    r.documentType,
    r.customer,
    r.cashier,
    r.items,
    detailMethodLabel(r),
    r.subtotal,
    r.itbis,
    r.discount,
    r.total,
    r.statusLabel,
  ];
}

function detailSheet(report: SalesReport): XLSX.WorkSheet {
  const body = report.rows.map(detailRow);
  const totals: Cell[] = [
    "TOTALES",
    "",
    "",
    "",
    "",
    "",
    report.kpis.items,
    "",
    "",
    report.kpis.itbis,
    report.kpis.discounts,
    report.kpis.totalBilled,
    "",
  ];
  const aoa: Cell[][] = [DETAIL_HEADERS, ...body, totals];
  const widths = [18, 18, 16, 24, 26, 18, 8, 16, 14, 14, 14, 14, 12];
  return sheetFromAoa(aoa, widths, [8, 9, 10, 11], 1);
}

// ─── Hojas 3-7: desgloses ────────────────────────────────────────────────────

function methodsSheet(report: SalesReport): XLSX.WorkSheet {
  const methods = report.methods;
  const totalMethods = r2(methods.reduce((s, m) => s + m.amount, 0));
  const totalPayments = methods.reduce((s, m) => s + m.count, 0);
  const totalSales = report.kpis.transactions;

  const header: Cell[] = [
    "Método de pago",
    "Cantidad de pagos",
    "Cantidad de ventas",
    "Monto total",
    "Porcentaje del total",
    "Ticket promedio por método",
  ];
  const body: Cell[][] = methods.map((m) => [
    m.label,
    m.count,
    m.sales,
    m.amount,
    totalMethods > 0 ? m.amount / totalMethods : 0,
    m.sales > 0 ? r2(m.amount / m.sales) : 0,
  ]);
  const totalRow: Cell[] = [
    "TOTAL",
    totalPayments,
    totalSales,
    totalMethods,
    totalMethods > 0 ? 1 : 0,
    totalSales > 0 ? r2(totalMethods / totalSales) : 0,
  ];
  const aoa: Cell[][] = [header, ...body, totalRow];
  const ws = sheetFromAoa(aoa, [22, 18, 18, 18, 20, 26], [3, 5], 1);
  for (let r = 1; r < aoa.length; r++) applyCellFmt(ws, r, 4, PCT_FMT);
  return ws;
}

function cashiersSheet(report: SalesReport): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    ["Cajero", "Transacciones", "Total"],
    ...report.cashiers.map((c) => [c.name, c.transactions, c.total] as Cell[]),
  ];
  return sheetFromAoa(aoa, [28, 16, 18], [2], 1);
}

function sellersSheet(report: SalesReport): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    ["Vendedor", "Ventas", "Total vendido", "Ticket promedio"],
    ...report.sellers.map(
      (s) =>
        [
          s.name,
          s.transactions,
          s.total,
          s.transactions ? r2(s.total / s.transactions) : 0,
        ] as Cell[],
    ),
  ];
  return sheetFromAoa(aoa, [28, 14, 18, 18], [2, 3], 1);
}

function branchesSheet(report: SalesReport): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    ["Sucursal", "Transacciones", "Total"],
    ...report.branches.map((b) => [b.name, b.transactions, b.total] as Cell[]),
  ];
  return sheetFromAoa(aoa, [28, 16, 18], [2], 1);
}

function productsSheet(report: SalesReport): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    ["Producto", "SKU", "Cantidad", "Total", "Costo", "Margen"],
    ...report.products.map(
      (p) =>
        [
          p.name,
          p.sku,
          p.quantity,
          p.total,
          p.cost ?? "N/D",
          p.margin ?? "N/D",
        ] as Cell[],
    ),
  ];
  return sheetFromAoa(aoa, [34, 16, 12, 16, 16, 16], [3, 4, 5], 1);
}

function customersSheet(report: SalesReport): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    ["Cliente", "Documento", "Teléfono", "Compras", "Total gastado"],
    ...report.customers.map(
      (c) => [c.name, c.document, c.phone, c.purchases, c.total] as Cell[],
    ),
  ];
  return sheetFromAoa(aoa, [28, 18, 16, 12, 18], [4], 1);
}

// ─── Libro completo ──────────────────────────────────────────────────────────

/** Construye el libro Excel con sus 7 hojas. */
export function buildSalesReportWorkbook(
  report: SalesReport,
  meta: SalesReportMeta,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, resumenSheet(report, meta), "Resumen");
  XLSX.utils.book_append_sheet(wb, detailSheet(report), "Ventas detalle");
  XLSX.utils.book_append_sheet(wb, methodsSheet(report), "Métodos de pago");
  XLSX.utils.book_append_sheet(wb, cashiersSheet(report), "Por cajero");
  XLSX.utils.book_append_sheet(wb, sellersSheet(report), "Por vendedor");
  XLSX.utils.book_append_sheet(wb, branchesSheet(report), "Por sucursal");
  XLSX.utils.book_append_sheet(wb, productsSheet(report), "Productos vendidos");
  XLSX.utils.book_append_sheet(wb, customersSheet(report), "Clientes");
  return wb;
}

/** Bytes .xlsx listos para descargar (type "array" = navegador-safe). */
export function salesReportXlsxBytes(
  report: SalesReport,
  meta: SalesReportMeta,
): Uint8Array {
  const wb = buildSalesReportWorkbook(report, meta);
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

// ─── CSV (ventas detalle) ────────────────────────────────────────────────────

function csvCell(value: Cell): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV de la tabla de ventas detalle (mismas columnas que la tabla). */
export function buildSalesDetailCsv(report: SalesReport): string {
  const lines: string[] = [];
  lines.push(DETAIL_HEADERS.map(csvCell).join(","));
  for (const r of report.rows) {
    lines.push(detailRow(r).map(csvCell).join(","));
  }
  return lines.join("\r\n");
}

/** Nombre de archivo sugerido con timestamp seguro. */
export function salesReportFilename(ext: "xlsx" | "csv", stamp: string): string {
  const safe = stamp.replace(/[^0-9A-Za-z_-]+/g, "-");
  return `Reporte-ventas-${safe}.${ext}`;
}
