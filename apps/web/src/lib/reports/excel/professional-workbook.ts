import type ExcelJS from "exceljs";
import type {
  CellFormat,
  ColumnSpec,
  KpiSpec,
  ReportMeta,
  SheetSpec,
  TableSpec,
  WorkbookSpec,
} from "./types";

/**
 * Motor CENTRAL de Excel profesional DermaLand (ExcelJS, .xlsx real).
 *
 * - Identidad corporativa: paleta del sistema (globals.css) — teal profundo
 *   #00685F (encabezados), teal vivo #0D9488 (acentos), navy #0B1C30 (texto).
 * - Cada hoja: encabezado DermaLand + título + rango/sucursal/filtros +
 *   generado por/fecha, luego KPIs y tablas con formato.
 * - Tablas: encabezado corporativo texto blanco, filas alternas, bordes
 *   suaves, montos RD$ numéricos (nunca texto), AutoFilter, freeze panes,
 *   fila TOTAL destacada.
 * - Sin UUIDs/tokens/datos técnicos: el spec lo arma cada reporte con las
 *   MISMAS estructuras que muestra en pantalla.
 */

// ─── Paleta corporativa (ARGB) ───────────────────────────────────────────────
const BRAND = {
  primary: "FF00685F", // --brand-primary
  accent: "FF0D9488", // --brand-accent
  fg: "FF0B1C30", // --brand-fg
  white: "FFFFFFFF",
  zebra: "FFF3F7F6", // fila alterna (teal 2%)
  metaGray: "FF6B7280",
  totalFill: "FFE0F2F0", // fondo fila TOTAL (teal suave)
  border: "FFD9E2E1",
};

export const NUM_FMT: Record<Exclude<CellFormat, "text">, string> = {
  currency: '"RD$"#,##0.00',
  int: "#,##0",
  decimal: "#,##0.00",
  percent: "0.00%",
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm AM/PM",
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BRAND.border } },
  left: { style: "thin", color: { argb: BRAND.border } },
  bottom: { style: "thin", color: { argb: BRAND.border } },
  right: { style: "thin", color: { argb: BRAND.border } },
};

function alignmentFor(format: CellFormat | undefined): Partial<ExcelJS.Alignment> {
  switch (format) {
    case "currency":
    case "int":
    case "decimal":
    case "percent":
      return { horizontal: "right", vertical: "middle" };
    case "date":
    case "datetime":
      return { horizontal: "center", vertical: "middle" };
    default:
      return { horizontal: "left", vertical: "middle", wrapText: false };
  }
}

/** Ancho auto-ajustado con topes razonables por tipo. */
function autoWidth(col: ColumnSpec, rows: TableSpec["rows"]): number {
  if (col.width) return col.width;
  const maxByFormat: Record<string, number> = {
    currency: 16,
    int: 12,
    decimal: 14,
    percent: 12,
    date: 14,
    datetime: 22,
    text: 46,
  };
  const cap = maxByFormat[col.format ?? "text"] ?? 40;
  let w = col.header.length + 2;
  for (const r of rows.slice(0, 200)) {
    const v = r[col.key];
    const len =
      v == null
        ? 0
        : v instanceof Date
          ? 18
          : typeof v === "number"
            ? String(Math.round(v)).length + 6
            : String(v).length;
    if (len + 2 > w) w = len + 2;
  }
  return Math.max(10, Math.min(w, cap));
}

/** Sanitiza nombre de hoja (Excel: ≤31 chars, sin \\ / ? * [ ] :). */
export function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Hoja";
}

/** Nombre de archivo estándar: Reporte_Ventas_DermaLand_2026-07-06.xlsx */
export function reportFileName(reportSlug: string, date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  const slug = reportSlug.replace(/\s+/g, "_");
  return `${slug}_DermaLand_${iso}.xlsx`;
}

// ─── Construcción ────────────────────────────────────────────────────────────

function addHeader(ws: ExcelJS.Worksheet, meta: ReportMeta, columnCount: number) {
  const span = Math.max(columnCount, 4);
  // Marca
  const brandRow = ws.addRow(["DermaLand"]);
  brandRow.height = 26;
  ws.mergeCells(brandRow.number, 1, brandRow.number, span);
  brandRow.getCell(1).font = {
    name: "Calibri",
    size: 18,
    bold: true,
    color: { argb: BRAND.primary },
  };
  // Título del reporte
  const titleRow = ws.addRow([meta.title]);
  titleRow.height = 20;
  ws.mergeCells(titleRow.number, 1, titleRow.number, span);
  titleRow.getCell(1).font = {
    name: "Calibri",
    size: 13,
    bold: true,
    color: { argb: BRAND.fg },
  };
  if (meta.subtitle) {
    const st = ws.addRow([meta.subtitle]);
    ws.mergeCells(st.number, 1, st.number, span);
    st.getCell(1).font = { size: 10, italic: true, color: { argb: BRAND.metaGray } };
  }
  // Metadatos (rango, sucursal, filtros, generado)
  const metaLines = [
    `Rango: ${meta.rangeLabel}`,
    `Sucursal: ${meta.branchLabel}`,
    `Filtros: ${meta.filtersLabel}`,
    `Generado: ${meta.generatedAtLabel} (hora RD)`,
    `Generado por: ${meta.generatedBy}`,
  ];
  for (const line of metaLines) {
    const r = ws.addRow([line]);
    ws.mergeCells(r.number, 1, r.number, span);
    r.getCell(1).font = { size: 9, color: { argb: BRAND.metaGray } };
  }
  ws.addRow([]);
}

function addKpis(ws: ExcelJS.Worksheet, kpis: KpiSpec[]) {
  const title = ws.addRow(["Indicadores"]);
  title.getCell(1).font = { size: 11, bold: true, color: { argb: BRAND.accent } };
  for (const k of kpis) {
    const row = ws.addRow([k.label, k.value ?? "—"]);
    row.getCell(1).font = { size: 10, color: { argb: BRAND.fg } };
    const vCell = row.getCell(2);
    vCell.font = { size: 10, bold: true, color: { argb: BRAND.fg } };
    if (k.format && k.format !== "text" && typeof k.value === "number") {
      vCell.numFmt = NUM_FMT[k.format];
    }
    vCell.alignment = alignmentFor(k.format);
  }
  ws.addRow([]);
}

function addTable(ws: ExcelJS.Worksheet, table: TableSpec, freeze: boolean): void {
  if (table.title) {
    const t = ws.addRow([table.title]);
    ws.mergeCells(t.number, 1, t.number, Math.max(table.columns.length, 2));
    t.getCell(1).font = { size: 11, bold: true, color: { argb: BRAND.accent } };
  }

  // Encabezado corporativo
  const headerRow = ws.addRow(table.columns.map((c) => c.header));
  headerRow.height = 18;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.primary } };
    cell.font = { size: 10, bold: true, color: { argb: BRAND.white } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = THIN_BORDER;
  });

  // Datos con zebra + formatos
  table.rows.forEach((rowData, idx) => {
    const row = ws.addRow(table.columns.map((c) => rowData[c.key] ?? null));
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = table.columns[colNumber - 1]!;
      if (col.format && col.format !== "text") cell.numFmt = NUM_FMT[col.format];
      cell.alignment = alignmentFor(col.format);
      cell.font = { size: 10, color: { argb: BRAND.fg } };
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
      }
    });
  });

  // Fila TOTAL destacada (valores del reporte, no fórmulas → consistencia).
  if (table.totals) {
    const firstKey = table.columns[0]!.key;
    const values = table.columns.map((c, i) => {
      if (i === 0 && table.totals![firstKey] == null) return "TOTAL";
      return table.totals![c.key] ?? null;
    });
    const totalRow = ws.addRow(values);
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = table.columns[colNumber - 1]!;
      if (col.format && col.format !== "text" && typeof cell.value === "number") {
        cell.numFmt = NUM_FMT[col.format];
      }
      cell.font = { size: 10, bold: true, color: { argb: BRAND.primary } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.totalFill } };
      cell.alignment = alignmentFor(col.format);
      cell.border = THIN_BORDER;
    });
  }

  // AutoFilter (default: tablas con 2+ filas)
  const useFilter = table.autoFilter ?? table.rows.length >= 2;
  if (useFilter) {
    ws.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: headerRow.number + table.rows.length, column: table.columns.length },
    };
  }

  // Freeze panes bajo el encabezado de la PRIMERA tabla
  if (freeze && !ws.views?.length) {
    ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRow.number }];
  }

  // Anchos
  table.columns.forEach((c, i) => {
    const current = ws.getColumn(i + 1).width ?? 0;
    const w = autoWidth(c, table.rows);
    if (w > current) ws.getColumn(i + 1).width = w;
  });

  ws.addRow([]);
}

/**
 * Construye el Workbook profesional desde un spec puro.
 * ExcelJS se pasa como parámetro para permitir dynamic import en cliente
 * (no engorda el bundle) y uso directo en tests Node.
 */
export function buildProfessionalWorkbook(
  Excel: typeof ExcelJS,
  spec: WorkbookSpec,
): ExcelJS.Workbook {
  const wb = new Excel.Workbook();
  wb.creator = "DermaLand";
  wb.created = new Date();

  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sanitizeSheetName(sheet.name), {
      properties: { defaultRowHeight: 15 },
    });
    const columnCount = Math.max(
      ...sheet.tables.map((t) => t.columns.length),
      2,
    );
    addHeader(ws, spec.meta, columnCount);
    if (sheet.kpis?.length) addKpis(ws, sheet.kpis);
    sheet.tables.forEach((t) => addTable(ws, t, sheet.freezeHeader ?? true));
  }
  return wb;
}

/** Descarga en navegador (llamar tras dynamic import de exceljs). */
export async function downloadWorkbook(
  wb: ExcelJS.Workbook,
  filename: string,
): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Helper de alto nivel para las páginas: importa ExcelJS on-demand,
 * construye y descarga. El caller maneja toasts (Generando…/OK/Error).
 */
export async function exportProfessionalWorkbook(
  spec: WorkbookSpec,
  filename: string,
): Promise<void> {
  const Excel = (await import("exceljs")).default;
  const wb = buildProfessionalWorkbook(Excel, spec);
  await downloadWorkbook(wb, filename);
}
