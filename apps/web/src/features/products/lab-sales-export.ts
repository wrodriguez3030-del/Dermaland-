// Exportación del ranking de laboratorios a Excel (3 hojas) y CSV.
// Presentación pura con SheetJS (sin red ni fs). NO expone ids internos.

import * as XLSX from "xlsx";
import type { LabSalesRow, LabSalesSummary, LabProductRow } from "./lab-sales";

const MONEY_FMT = '"RD$"#,##0.00';
const PCT_FMT = "0.00%";

type Cell = string | number | null;

export interface LabSalesMeta {
  businessName: string;
  generatedAt: string;
  branchLabel: string;
  rangeLabel: string;
  searchLabel: string;
}

function fmtDateTime(iso: string): string {
  const d = iso.slice(0, 10);
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const dd = date ? `${date[3]}/${date[2]}/${date[1]}` : iso;
  return m ? `${dd} ${m[1]}:${m[2]}` : dd;
}

function buildSheet(
  aoa: Cell[][],
  widths: number[],
  moneyCols: number[] = [],
  pctCols: number[] = [],
  startRow = 1,
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  for (let r = startRow; r < aoa.length; r++) {
    for (const c of moneyCols) applyFmt(ws, r, c, MONEY_FMT);
    for (const c of pctCols) applyFmt(ws, r, c, PCT_FMT);
  }
  return ws;
}

function applyFmt(ws: XLSX.WorkSheet, r: number, c: number, fmt: string): void {
  const ref = XLSX.utils.encode_cell({ r, c });
  const cell = ws[ref];
  if (cell && typeof cell.v === "number") {
    cell.t = "n";
    cell.z = fmt;
  }
}

function resumenSheet(summary: LabSalesSummary, meta: LabSalesMeta): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    [meta.businessName || "DermaLand", null],
    ["Ranking de laboratorios por ventas", null],
    ["", null],
    ["Sucursal", meta.branchLabel],
    ["Rango", meta.rangeLabel],
    ["Búsqueda", meta.searchLabel || "—"],
    ["Generado", fmtDateTime(meta.generatedAt)],
    ["", null],
    ["Laboratorio líder", summary.leader?.lab.name ?? "—"],
    ["Ventas del líder", summary.leader?.totalMoney ?? 0],
    ["Total laboratorios", summary.totalLabs],
    ["Ventas acumuladas", summary.totalMoney],
    ["Unidades vendidas", summary.totalUnits],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 24 }, { wch: 28 }];
  applyFmt(ws, 9, 1, MONEY_FMT); // Ventas del líder
  applyFmt(ws, 11, 1, MONEY_FMT); // Ventas acumuladas
  return ws;
}

const RANKING_HEADERS: Cell[] = [
  "Ranking",
  "Laboratorio",
  "País",
  "Total vendido",
  "Unidades",
  "Transacciones",
  "Productos vendidos",
  "% vs líder",
];

function rankingSheet(rows: LabSalesRow[]): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    RANKING_HEADERS,
    ...rows.map((r) => [
      r.isUnassigned ? "—" : r.rank,
      r.lab.name,
      r.lab.country ?? "",
      r.totalMoney,
      r.units,
      r.transactions,
      r.productsSold,
      r.percentOfLeader / 100,
    ]),
  ];
  return buildSheet(aoa, [10, 30, 18, 16, 12, 14, 18, 12], [3], [7]);
}

const PRODUCT_HEADERS: Cell[] = ["Laboratorio", "Producto", "SKU", "Unidades", "Total vendido"];

function productsSheet(rows: LabProductRow[]): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    PRODUCT_HEADERS,
    ...rows.map((r) => [r.labName, r.name, r.sku, r.units, r.total]),
  ];
  return buildSheet(aoa, [28, 34, 16, 12, 16], [4]);
}

export function buildLabSalesWorkbook(
  rows: LabSalesRow[],
  summary: LabSalesSummary,
  productRows: LabProductRow[],
  meta: LabSalesMeta,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, resumenSheet(summary, meta), "Resumen");
  XLSX.utils.book_append_sheet(wb, rankingSheet(rows), "Ranking laboratorios");
  XLSX.utils.book_append_sheet(wb, productsSheet(productRows), "Productos por laboratorio");
  return wb;
}

export function labSalesXlsxBytes(
  rows: LabSalesRow[],
  summary: LabSalesSummary,
  productRows: LabProductRow[],
  meta: LabSalesMeta,
): Uint8Array {
  return XLSX.write(buildLabSalesWorkbook(rows, summary, productRows, meta), {
    bookType: "xlsx",
    type: "array",
  }) as Uint8Array;
}

function csvCell(value: Cell): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV del ranking (mismas columnas que la hoja Ranking laboratorios). */
export function buildLabSalesCsv(rows: LabSalesRow[]): string {
  const lines: string[] = [RANKING_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.isUnassigned ? "—" : r.rank,
        r.lab.name,
        r.lab.country ?? "",
        r.totalMoney,
        r.units,
        r.transactions,
        r.productsSold,
        `${r.percentOfLeader}%`,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export function labSalesFilename(ext: "xlsx" | "csv", stamp: string): string {
  const safe = stamp.replace(/[^0-9A-Za-z_-]+/g, "-");
  return `Ranking-laboratorios-${safe}.${ext}`;
}
