/**
 * Tipos de la capa CENTRAL de PDF profesional de reportes.
 *
 * Cada reporte construye un `ReportPdfSpec` PURO (mismos datos/filtros que la
 * pantalla y el Excel), lo POSTea a `/api/reports/pdf` y el servicio pdfkit lo
 * renderiza con identidad DermaLand (título grande + período/sucursal, KPI
 * cards, tabla teal, TOTAL resaltado, footer con Página X de Y). Sin UUIDs ni
 * datos técnicos: el spec sólo lleva lo que se muestra.
 */

export type PdfCellFormat =
  | "text"
  | "index" // No. correlativo (lo llena el renderer con el ordinal de fila)
  | "currency" // RD$#,##0.00
  | "int" // #,##0
  | "decimal" // #,##0.00
  | "percent" // 0.00% (valor 0-1)
  | "date" // dd/mm/yyyy
  | "datetime"; // dd/mm/yyyy hh:mm

export type PdfAlign = "left" | "center" | "right";

export interface PdfColumn {
  header: string;
  key: string;
  format?: PdfCellFormat;
  align?: PdfAlign;
  /** Peso relativo para repartir el ancho (texto) o ancho fijo sugerido. */
  weight?: number;
  /**
   * Nombre de un campo de la fila cuyo valor ("good"|"warn"|"bad") tiñe el
   * texto de ESTA celda. JSON-serializable (no función). Útil para el Estado
   * de conteos (verde/amarillo/rojo).
   */
  toneKey?: string;
}

export type PdfCellValue = string | number | null | undefined;

export interface PdfTable {
  columns: PdfColumn[];
  rows: Record<string, PdfCellValue>[];
  /** Fila TOTAL: valores ya calculados por el reporte (no fórmulas). */
  totals?: Record<string, PdfCellValue>;
  /** Mensaje cuando no hay filas. */
  emptyMessage?: string;
}

export type KpiTone = "default" | "good" | "warn" | "bad";

export interface PdfKpi {
  label: string;
  value: PdfCellValue;
  format?: PdfCellFormat;
  tone?: KpiTone;
}

export interface PdfSection {
  title?: string;
  table: PdfTable;
  /** Nota discreta bajo la tabla (gris, itálica). */
  footnote?: string;
}

export interface ReportPdfMeta {
  /** Título grande, p.ej. "REPORTE DE VENTAS". */
  title: string;
  /** Subtítulo gris, p.ej. "Resumen de ventas por período, sucursal y método". */
  subtitle?: string;
  /** "Fecha de corte: 07/07/2026" o rango. */
  cutLabel?: string;
  /** Bloque derecho: período (bold teal), p.ej. "JULIO 2026" o "TODO". */
  periodLabel: string;
  /** Bloque derecho: sucursal (bold), p.ej. "DERMALAND CUTIS". */
  branchLabel: string;
  /** Bloque derecho: negocio (gris), p.ej. "DERMALAND". */
  businessName: string;
  /** Filtros activos legibles o "Sin filtros adicionales". */
  filtersLabel: string;
  generatedBy: string;
  /** Fecha/hora legible RD para el footer. */
  generatedAtLabel: string;
  /** Tipo para el footer, p.ej. "Reporte de ventas". */
  reportKind: string;
}

export interface ReportPdfSpec {
  meta: ReportPdfMeta;
  /** "auto" = landscape si alguna tabla tiene >6 columnas. */
  orientation?: "portrait" | "landscape" | "auto";
  kpis?: PdfKpi[];
  sections: PdfSection[];
}
