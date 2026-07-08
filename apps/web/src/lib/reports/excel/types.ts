/**
 * Tipos de la capa CENTRAL de exportación Excel profesional.
 *
 * Cada reporte construye un `WorkbookSpec` PURO (testeable sin ExcelJS) con
 * los MISMOS datos/filtros que muestra la pantalla, y `professional-workbook`
 * lo convierte en un .xlsx real con identidad DermaLand.
 */

/** Formato de celda soportado (se mapea a numFmt de Excel). */
export type CellFormat =
  | "text"
  | "currency" // RD$#,##0.00
  | "int" // #,##0
  | "decimal" // #,##0.00
  | "percent" // 0.00%  (valor 0-1)
  | "date" // dd/mm/yyyy
  | "datetime"; // dd/mm/yyyy hh:mm AM/PM

export interface ColumnSpec {
  /** Título visible del encabezado. */
  header: string;
  /** Key de la fila (objeto) de donde sale el valor. */
  key: string;
  /** Formato de la celda; default "text". */
  format?: CellFormat;
  /** Ancho en caracteres; si falta se auto-ajusta con tope razonable. */
  width?: number;
}

/** Valor de una celda de datos (los formatos numéricos exigen number). */
export type CellValue = string | number | Date | null | undefined;

export interface TableSpec {
  /** Título opcional de la sección (fila destacada encima de la tabla). */
  title?: string;
  columns: ColumnSpec[];
  rows: Record<string, CellValue>[];
  /**
   * Fila TOTAL: keys→valores ya calculados por el reporte (misma fuente que
   * la pantalla — NO se depende de fórmulas para la consistencia). La
   * primera columna lleva la etiqueta "TOTAL" si no se provee.
   */
  totals?: Record<string, CellValue>;
  /** AutoFilter sobre el encabezado (default true si hay ≥2 filas). */
  autoFilter?: boolean;
}

export interface KpiSpec {
  label: string;
  value: CellValue;
  format?: CellFormat;
}

export interface SheetSpec {
  /** Nombre de la pestaña (≤31 chars, sin caracteres inválidos). */
  name: string;
  kpis?: KpiSpec[];
  tables: TableSpec[];
  /** Congelar hasta la fila de encabezados de la 1ª tabla (default true). */
  freezeHeader?: boolean;
}

export interface ReportMeta {
  /** Nombre del reporte, p.ej. "Reporte de ventas". */
  title: string;
  subtitle?: string;
  /** "Todo" | "01/06/2026 – 30/06/2026" ... */
  rangeLabel: string;
  /** "Todas las sucursales" | nombre de la sucursal. */
  branchLabel: string;
  /** Filtros activos legibles ("Método: Tarjeta · Vendedor: Dario") o "Sin filtros adicionales". */
  filtersLabel: string;
  generatedBy: string;
  /** Fecha/hora legible RD; la genera el caller para coincidir con pantalla. */
  generatedAtLabel: string;
}

export interface WorkbookSpec {
  meta: ReportMeta;
  sheets: SheetSpec[];
}
