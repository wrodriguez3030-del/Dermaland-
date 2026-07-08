import "server-only";
import PDFDocument from "pdfkit";
import type {
  PdfAlign,
  PdfCellFormat,
  PdfCellValue,
  PdfColumn,
  PdfKpi,
  PdfSection,
  PdfTable,
  ReportPdfMeta,
  ReportPdfSpec,
} from "@/lib/reports/pdf/types";

/**
 * Renderizador CENTRAL de PDF profesional de reportes (pdfkit, server-side).
 *
 * Toma un `ReportPdfSpec` (mismos datos/filtros que la pantalla) y produce un
 * Buffer PDF con identidad DermaLand: encabezado (título grande + período/
 * sucursal a la derecha), KPI cards, tablas teal con TOTAL resaltado,
 * auto-paginación con encabezado de tabla repetido y footer "Página X de Y".
 * No imprime UUIDs ni datos técnicos.
 */

export class ReportPdfError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(`ReportPdf: ${message}`);
    this.name = "ReportPdfError";
    this.cause = cause;
  }
}

type PDFDoc = InstanceType<typeof PDFDocument>;

// ── Paleta corporativa ───────────────────────────────────────────────────────
const C = {
  primary: "#00685F",
  accent: "#0D9488",
  fg: "#0B1C30",
  sub: "#5B6470",
  meta: "#6B7280",
  kpiBg: "#F5F7F8",
  kpiBorder: "#DCE5E4",
  white: "#FFFFFF",
  grid: "#E4E9EC",
  zebra: "#F9FAFB",
  totalBg: "#E0F2F0",
  good: "#16A34A",
  warn: "#D97706",
  bad: "#DC2626",
  footer: "#8A94A0",
};

const MARGIN = 40;
const FOOTER_RESERVE = 34;

// ── Formato de valores ───────────────────────────────────────────────────────
function money(n: number): string {
  return `RD$${(Number.isFinite(n) ? n : 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function toDate(v: PdfCellValue): Date | null {
  // Las celdas de fecha siempre llegan como ISO string (PdfCellValue no incluye
  // Date). Antes había una rama `v instanceof Date` inalcanzable sobre un
  // primitivo → error de tipo TS2358 que rompía el build. Solo los strings se
  // parsean; null/undefined/number → null.
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function formatValue(
  value: PdfCellValue,
  format: PdfCellFormat | undefined,
  rowIndex: number,
): string {
  switch (format) {
    case "index":
      return String(rowIndex + 1);
    case "currency":
      return typeof value === "number" ? money(value) : String(value ?? "—");
    case "int":
      return typeof value === "number" ? value.toLocaleString("es-DO") : String(value ?? "—");
    case "decimal":
      return typeof value === "number"
        ? value.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(value ?? "—");
    case "percent":
      return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : String(value ?? "—");
    case "date": {
      const d = toDate(value);
      return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "—";
    }
    case "datetime": {
      const d = toDate(value);
      return d
        ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
        : "—";
    }
    default:
      return value == null || value === "" ? "" : String(value);
  }
}
function defaultAlign(format: PdfCellFormat | undefined): PdfAlign {
  switch (format) {
    case "currency":
    case "int":
    case "decimal":
    case "percent":
      return "right";
    case "index":
    case "date":
    case "datetime":
      return "center";
    default:
      return "left";
  }
}
function kpiColor(tone: PdfKpi["tone"]): string {
  switch (tone) {
    case "good":
      return C.good;
    case "warn":
      return C.warn;
    case "bad":
      return C.bad;
    default:
      return C.primary;
  }
}

// ── Anchos de columna (siempre caben en contentW) ────────────────────────────
const FIXED_W: Record<string, number> = {
  index: 30,
  currency: 82,
  int: 58,
  decimal: 68,
  percent: 56,
  date: 64,
  datetime: 96,
};
function columnWidths(columns: PdfColumn[], contentW: number): number[] {
  const raw = columns.map((c) => {
    const fmt = c.format ?? "text";
    if (fmt === "text") return Math.max(60, (c.weight ?? 1) * 120);
    return FIXED_W[fmt] ?? 70;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  const scale = contentW / sum; // escala exacta al ancho disponible → sin desbordes
  return raw.map((w) => w * scale);
}

// ── Geometría / contexto ─────────────────────────────────────────────────────
interface Ctx {
  doc: PDFDoc;
  pageW: number;
  pageH: number;
  contentW: number;
  bottom: number;
  meta: ReportPdfMeta;
}

// ── Gestor CENTRAL de paginación ─────────────────────────────────────────────
// Geometría única para TODOS los reportes (ver Ctx: `bottom` = fin del área de
// contenido; la banda [bottom, pageH-MARGIN] queda reservada SOLO para el
// footer). Nadie dibuja texto por debajo de `pageH - MARGIN` (maxY de pdfkit) →
// se evita por completo la auto-paginación de pdfkit (que creaba páginas en
// blanco cuando el footer se dibujaba fuera del margen).

/** Alto libre restante en la página actual, sobre la banda de footer. */
function remainingHeight(ctx: Ctx): number {
  return ctx.bottom - ctx.doc.y;
}

/**
 * REGLA PRINCIPAL: nunca crear una página sin contenido real que dibujar
 * después. Se llama ANTES de dibujar un bloque (fila, título, TOTAL) con el
 * alto que ese bloque necesita. Si NO cabe en el alto restante, crea UNA página
 * nueva y dibuja el encabezado de continuación. Devuelve `true` si saltó de
 * página (para que el caller redibuje lo que corresponda, p.ej. el encabezado
 * de la tabla). Si cabe, no hace nada y devuelve `false`.
 */
function ensureSpace(ctx: Ctx, requiredHeight: number): boolean {
  if (requiredHeight <= remainingHeight(ctx)) return false;
  ctx.doc.addPage();
  ctx.doc.y = MARGIN;
  drawContinuationHeader(ctx);
  return true;
}

function resolveLandscape(spec: ReportPdfSpec): boolean {
  if (spec.orientation === "landscape") return true;
  if (spec.orientation === "portrait") return false;
  const maxCols = Math.max(
    1,
    ...spec.sections.map((s) => s.table.columns.length),
  );
  return maxCols > 6;
}

// ── Encabezado (página 1) ────────────────────────────────────────────────────
function drawMainHeader(ctx: Ctx): void {
  const { doc, meta } = ctx;
  const top = MARGIN;
  const rightW = 200;
  const leftW = ctx.contentW - rightW - 16;

  // Bloque derecho (período / sucursal / negocio)
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(C.primary)
    .text(meta.periodLabel.toUpperCase(), MARGIN + leftW + 16, top, {
      width: rightW,
      align: "right",
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(C.fg)
    .text(meta.branchLabel.toUpperCase(), MARGIN + leftW + 16, doc.y + 1, {
      width: rightW,
      align: "right",
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(C.meta)
    .text(meta.businessName.toUpperCase(), MARGIN + leftW + 16, doc.y + 1, {
      width: rightW,
      align: "right",
    });
  const rightBottom = doc.y;

  // Bloque izquierdo (título / subtítulo / corte)
  doc
    .font("Helvetica-Bold")
    .fontSize(21)
    .fillColor(C.fg)
    .text(meta.title.toUpperCase(), MARGIN, top, { width: leftW });
  if (meta.subtitle) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(C.sub)
      .text(meta.subtitle, MARGIN, doc.y + 1, { width: leftW });
  }
  if (meta.cutLabel) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(C.meta)
      .text(meta.cutLabel, MARGIN, doc.y + 1, { width: leftW });
  }
  const leftBottom = doc.y;

  let y = Math.max(leftBottom, rightBottom) + 8;

  // Línea de filtros (discreta)
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(C.meta)
    .text(`Filtros: ${meta.filtersLabel}`, MARGIN, y, { width: ctx.contentW });
  y = doc.y + 6;

  // Divisor
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + ctx.contentW, y)
    .lineWidth(1)
    .strokeColor(C.primary)
    .stroke();
  doc.y = y + 12;
}

/** Encabezado compacto para páginas de continuación. */
function drawContinuationHeader(ctx: Ctx): void {
  const { doc, meta } = ctx;
  const y = MARGIN;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(C.primary)
    .text(`${meta.title} — ${meta.periodLabel}`, MARGIN, y, {
      width: ctx.contentW,
    });
  const ly = doc.y + 3;
  doc
    .moveTo(MARGIN, ly)
    .lineTo(MARGIN + ctx.contentW, ly)
    .lineWidth(0.75)
    .strokeColor(C.grid)
    .stroke();
  doc.y = ly + 8;
}

// ── KPI cards ────────────────────────────────────────────────────────────────
function drawKpiCards(ctx: Ctx, kpis: PdfKpi[]): void {
  if (!kpis.length) return;
  const { doc } = ctx;
  const gap = 10;
  // Distribución equilibrada: ≤4 en una fila; 5-8 se parten en dos filas.
  const perRow =
    kpis.length <= 4 ? kpis.length : Math.min(5, Math.ceil(kpis.length / 2));
  const cardH = 46;

  for (let start = 0; start < kpis.length; start += perRow) {
    const slice = kpis.slice(start, start + perRow);
    const cardW = (ctx.contentW - gap * (slice.length - 1)) / slice.length;
    const y = doc.y;
    slice.forEach((k, i) => {
      const x = MARGIN + i * (cardW + gap);
      doc.roundedRect(x, y, cardW, cardH, 4).fillAndStroke(C.kpiBg, C.kpiBorder);
      const text =
        typeof k.value === "number"
          ? formatValue(k.value, k.format ?? "int", 0)
          : String(k.value ?? "—");
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor(kpiColor(k.tone))
        .text(text, x + 6, y + 8, { width: cardW - 12, align: "center" });
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(C.meta)
        .text(k.label.toUpperCase(), x + 6, y + 30, {
          width: cardW - 12,
          align: "center",
        });
    });
    doc.y = y + cardH + 10;
  }
}

// ── Tabla ────────────────────────────────────────────────────────────────────
const HEADER_H = 18;
const BODY_FONT = 8.5;
const PAD_X = 4;
const PAD_Y = 4;
/** Alto mínimo de fila (1 línea + padding). */
const MIN_ROW_H = BODY_FONT * 1.18 + PAD_Y * 2;

/**
 * Alto que ocupará una fila (fuente única de verdad para el pre-chequeo de
 * salto de página Y para el dibujo → nunca discrepan). El texto envuelve hasta
 * 2 líneas; las columnas no-texto son de 1 línea.
 */
function estimateRowHeight(
  ctx: Ctx,
  columns: PdfColumn[],
  widths: number[],
  row: Record<string, PdfCellValue>,
  rowIndex: number,
): number {
  const lineH = BODY_FONT * 1.18;
  let contentH = lineH;
  columns.forEach((c, i) => {
    if ((c.format ?? "text") !== "text") return;
    ctx.doc.font("Helvetica").fontSize(BODY_FONT);
    const h = Math.min(
      ctx.doc.heightOfString(formatValue(row[c.key], c.format, rowIndex), {
        width: widths[i]! - PAD_X * 2,
      }),
      lineH * 2,
    );
    if (h > contentH) contentH = h;
  });
  return contentH + PAD_Y * 2;
}

function drawTableHeader(
  ctx: Ctx,
  columns: PdfColumn[],
  widths: number[],
): number {
  const { doc } = ctx;
  const y = doc.y;
  doc.rect(MARGIN, y, ctx.contentW, HEADER_H).fill(C.primary);
  let x = MARGIN;
  doc.font("Helvetica-Bold").fontSize(7.8).fillColor(C.white);
  columns.forEach((c, i) => {
    const w = widths[i]!;
    doc.text(c.header.toUpperCase(), x + PAD_X, y + 5, {
      width: w - PAD_X * 2,
      align: c.align ?? defaultAlign(c.format),
      lineBreak: false,
      ellipsis: true,
    });
    x += w;
  });
  return y + HEADER_H;
}

function drawRow(
  ctx: Ctx,
  columns: PdfColumn[],
  widths: number[],
  row: Record<string, PdfCellValue>,
  rowIndex: number,
  opts: { zebra?: boolean; total?: boolean } = {},
): number {
  const { doc } = ctx;
  const rowH = estimateRowHeight(ctx, columns, widths, row, rowIndex);
  const contentH = rowH - PAD_Y * 2;
  const y = doc.y;

  if (opts.total) {
    doc.rect(MARGIN, y, ctx.contentW, rowH).fill(C.totalBg);
    doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + ctx.contentW, y)
      .lineWidth(1)
      .strokeColor(C.primary)
      .stroke();
  } else if (opts.zebra) {
    doc.rect(MARGIN, y, ctx.contentW, rowH).fill(C.zebra);
  }

  const toneColor: Record<string, string> = {
    good: C.good,
    warn: C.warn,
    bad: C.bad,
  };
  // Fila TOTAL: si el reporte NO trae su propia etiqueta (una celda de texto no
  // vacía), se coloca "TOTAL" en la primera columna de TEXTO legible (nunca en
  // una columna de índice, que es angosta y truncaría "TOTAL" → "TOT"). Las
  // columnas de índice quedan vacías en la fila TOTAL.
  let totalLabelCol = -1;
  if (opts.total) {
    const hasLabel = columns.some(
      (c) =>
        (c.format ?? "text") !== "index" &&
        typeof row[c.key] === "string" &&
        (row[c.key] as string).trim() !== "",
    );
    if (!hasLabel) {
      totalLabelCol = columns.findIndex((c) => (c.format ?? "text") === "text");
      if (totalLabelCol === -1) {
        totalLabelCol = columns.findIndex((c) => (c.format ?? "text") !== "index");
      }
    }
  }
  let x = MARGIN;
  columns.forEach((c, i) => {
    const w = widths[i]!;
    const str = opts.total
      ? (c.format ?? "text") === "index"
        ? ""
        : i === totalLabelCol
          ? "TOTAL"
          : formatValue(row[c.key], c.format, rowIndex)
      : formatValue(row[c.key], c.format, rowIndex);
    // Color de celda: por tono (Estado verde/amarillo/rojo) o el default.
    let cellColor = opts.total ? C.primary : C.fg;
    if (!opts.total && c.toneKey) {
      const tone = row[c.toneKey];
      if (typeof tone === "string" && toneColor[tone]) cellColor = toneColor[tone];
    }
    doc
      .font(opts.total ? "Helvetica-Bold" : "Helvetica")
      .fontSize(BODY_FONT)
      .fillColor(cellColor)
      .text(str, x + PAD_X, y + PAD_Y, {
        width: w - PAD_X * 2,
        align: c.align ?? defaultAlign(c.format),
        height: contentH,
        ellipsis: (c.format ?? "text") === "text",
        lineBreak: (c.format ?? "text") === "text",
      });
    x += w;
  });

  // Líneas de grilla (bajo la fila + separadores verticales suaves)
  doc
    .moveTo(MARGIN, y + rowH)
    .lineTo(MARGIN + ctx.contentW, y + rowH)
    .lineWidth(0.4)
    .strokeColor(C.grid)
    .stroke();
  x = MARGIN;
  doc.lineWidth(0.4).strokeColor(C.grid);
  for (let i = 0; i < widths.length - 1; i++) {
    x += widths[i]!;
    doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
  }

  // Avance DETERMINISTA: la fila empezó en `y` y mide `rowH`. `doc.text` movió
  // `doc.y` como efecto colateral; se fija explícitamente para que el caller NO
  // vuelva a sumar (antes: doble avance ~1.77× → tablas infladas).
  doc.y = y + rowH;
  return rowH;
}

function drawTable(ctx: Ctx, table: PdfTable): void {
  const { doc } = ctx;
  const widths = columnWidths(table.columns, ctx.contentW);

  const y = drawTableHeader(ctx, table.columns, widths);
  doc.y = y;

  if (table.rows.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(C.meta)
      .text(table.emptyMessage ?? "Sin datos para mostrar.", MARGIN, y + 8, {
        width: ctx.contentW,
        align: "center",
      });
    doc.y = y + 26;
    return;
  }

  table.rows.forEach((row, idx) => {
    // Salto SOLO si la fila real no cabe → tras el salto se repite el encabezado
    // de la tabla. `drawRow` fija `doc.y` (avance único, sin doble conteo).
    const rowH = estimateRowHeight(ctx, table.columns, widths, row, idx);
    if (ensureSpace(ctx, rowH)) {
      doc.y = drawTableHeader(ctx, table.columns, widths);
    }
    drawRow(ctx, table.columns, widths, row, idx, { zebra: idx % 2 === 1 });
  });

  // Fila TOTAL: nueva página SOLO si de verdad no cabe (y se repite el
  // encabezado de la tabla), nunca dejando una página previa vacía.
  if (table.totals) {
    const estH = estimateRowHeight(ctx, table.columns, widths, table.totals, 0);
    if (ensureSpace(ctx, estH)) {
      doc.y = drawTableHeader(ctx, table.columns, widths);
    }
    drawRow(ctx, table.columns, widths, table.totals, 0, { total: true });
  }
}

// ── Secciones ────────────────────────────────────────────────────────────────
function drawSection(ctx: Ctx, section: PdfSection): void {
  const { doc } = ctx;
  if (section.title) {
    // Mantener el título JUNTO al inicio de su tabla (encabezado + 1ª fila):
    // así nunca queda un título solo al pie con la tabla saltando a otra página
    // (que dejaría una página casi vacía).
    const widths = columnWidths(section.table.columns, ctx.contentW);
    const firstRowH = section.table.rows.length
      ? estimateRowHeight(ctx, section.table.columns, widths, section.table.rows[0]!, 0)
      : MIN_ROW_H;
    ensureSpace(ctx, 20 + HEADER_H + firstRowH);
    const y = doc.y + 4;
    doc.rect(MARGIN, y, 3, 12).fill(C.primary);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(C.fg)
      .text(section.title, MARGIN + 8, y - 1, { width: ctx.contentW - 8 });
    doc.y = y + 16; // avance determinista bajo el título
  }
  drawTable(ctx, section.table);
  if (section.footnote) {
    ensureSpace(ctx, 20);
    doc
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(C.meta)
      .text(section.footnote, MARGIN, doc.y + 4, { width: ctx.contentW });
    doc.y = doc.y + 6;
  }
  doc.y += 10;
}

// ── Footer (segunda pasada: Página X de Y en todas las páginas) ──────────────
function drawFooters(ctx: Ctx): void {
  const { doc, meta } = ctx;
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    // El footer se dibuja DENTRO de la banda reservada [ctx.bottom, pageH-MARGIN]
    // (por encima del maxY de pdfkit = pageH-MARGIN). Antes se dibujaba en
    // `pageH - MARGIN + 4` (POR DEBAJO del margen) y cada `text()` disparaba la
    // auto-paginación de pdfkit → páginas en blanco. Ahora nada se dibuja bajo
    // el margen, así que no se crea ninguna página extra.
    const y = ctx.bottom + 4;
    doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + ctx.contentW, y)
      .lineWidth(0.5)
      .strokeColor(C.grid)
      .stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(C.footer);
    doc.text(`DermaLand · ${meta.reportKind}`, MARGIN, y + 5, {
      width: ctx.contentW / 2,
      align: "left",
      lineBreak: false,
    });
    doc.text(`Página ${i + 1} de ${total}`, MARGIN + ctx.contentW / 2, y + 5, {
      width: ctx.contentW / 2,
      align: "right",
      lineBreak: false,
    });
    doc
      .fontSize(7)
      .fillColor(C.footer)
      .text(
        `Generado: ${meta.generatedAtLabel} · ${meta.generatedBy} · Datos filtrados según los criterios seleccionados.`,
        MARGIN,
        y + 15,
        { width: ctx.contentW, align: "center", lineBreak: false },
      );
  }
}

// ── Entrada ──────────────────────────────────────────────────────────────────
export function generateReportPdf(spec: ReportPdfSpec): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const landscape = resolveLandscape(spec);
      const doc = new PDFDocument({
        size: "A4",
        layout: landscape ? "landscape" : "portrait",
        margin: MARGIN,
        bufferPages: true,
        info: {
          Title: spec.meta.title,
          Author: "DermaLand",
          Subject: spec.meta.reportKind,
        },
      });

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const ctx: Ctx = {
        doc,
        pageW,
        pageH,
        contentW: pageW - MARGIN * 2,
        bottom: pageH - MARGIN - FOOTER_RESERVE,
        meta: spec.meta,
      };

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(new ReportPdfError("pdfkit falló", err)));

      drawMainHeader(ctx);
      if (spec.kpis?.length) drawKpiCards(ctx, spec.kpis);
      for (const section of spec.sections) drawSection(ctx, section);
      drawFooters(ctx);

      doc.end();
    } catch (err) {
      reject(
        err instanceof ReportPdfError
          ? err
          : new ReportPdfError("error inesperado generando PDF", err),
      );
    }
  });
}
