// Exportación del Inventario físico a Excel (.xlsx, multi-hoja) con SheetJS.
//
// Presentación pura en memoria (sin red ni fs). Devuelve bytes (Uint8Array); la
// descarga al navegador la hace el componente. NO toca DGII, secuencias ni
// datos. El contenido sale del informe ya resuelto (`physical-count-report.ts`),
// así que NO expone ids internos ni almacén/warehouse.
//
// Nota: la edición community de SheetJS no escribe estilos de celda (relleno de
// color, negrita) ni paneles congelados/filtros; sí soporta anchos de columna y
// formatos numéricos. Por eso las diferencias se colorean con CÓDIGOS DE FORMATO
// numérico ([Red]/[Blue]) —que sí se escriben— en vez de relleno de celda. Los
// estados de texto (Correcto/Faltante/Sobrante) van como texto, sin color.

import * as XLSX from "xlsx";
import type {
  PhysicalCountReport,
  CountListRow,
} from "./physical-count-report";

// Moneda con negativos en rojo.
const MONEY_FMT = '"RD$"#,##0.00;[Red]-"RD$"#,##0.00';
// Valor de diferencia: positivo azul, negativo rojo, cero neutro.
const MONEY_DIFF_FMT = '[Blue]"RD$"#,##0.00;[Red]-"RD$"#,##0.00;"RD$"0.00';
// Cantidad de diferencia: positivo azul con +, negativo rojo con -, cero neutro.
const DIFF_QTY_FMT = "[Blue]+0;[Red]-0;0";

type Cell = string | number | null;

// ─── Fechas (string-based, sin zona horaria → determinista) ──────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = fmtDate(iso);
  const t = /T(\d{2}):(\d{2})/.exec(iso);
  return t ? `${date} ${t[1]}:${t[2]}` : date;
}

function num(value: number | null): Cell {
  return value == null ? "—" : value;
}

// ─── Construcción de hojas ───────────────────────────────────────────────────

function buildSheet(
  aoa: Cell[][],
  widths: number[],
  colFormats: Record<number, string> = {},
  startRow = 1,
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  for (let r = startRow; r < aoa.length; r++) {
    for (const [cStr, fmt] of Object.entries(colFormats)) {
      const c = Number(cStr);
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (cell && typeof cell.v === "number") {
        cell.t = "n";
        cell.z = fmt;
      }
    }
  }
  return ws;
}

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

// Hoja 1: Resumen ─────────────────────────────────────────────────────────────
function resumenSheet(report: PhysicalCountReport): XLSX.WorkSheet {
  const s = report.summary;
  const aoa: Cell[][] = [
    [s.businessName, null, null, null, null, null],
    [s.reportName, null, null, null, null, null],
    ["", null],
    ["Código del inventario", s.countNumber],
    ["Sucursal", s.branchName],
    ["Tipo de inventario", s.countTypeLabel],
    ["Estado", s.statusLabel],
    ["Fecha de inicio", fmtDateTime(s.startedAt)],
    ["Fecha de cierre", fmtDateTime(s.closedAt)],
    ["Usuario que inició", s.startedByName],
    ["Usuario que aprobó", s.approvedByName],
    ["Generado", fmtDateTime(s.generatedAt)],
    ["", null],
    ["Total productos del sistema", s.totalSystemProducts],
    ["Total productos escaneados", s.totalScannedProducts],
    ["Total escaneos", s.totalScans],
    ["Productos sin diferencia", s.productsMatch],
    ["Productos con faltante", s.productsShortage],
    ["Productos con sobrante", s.productsOverage],
    ["Valor estimado faltante", s.shortageValue],
    ["Valor estimado sobrante", s.overageValue],
    ["Valor neto de diferencia", s.netDifferenceValue],
    ["Nota", s.notes],
    ["", null],
    ["KPIS", null],
    [
      "TOTAL PRODUCTOS",
      "ESCANEADOS",
      "SIN DIFERENCIA",
      "FALTANTES",
      "SOBRANTES",
      "VALOR DIFERENCIA",
    ],
    [
      s.totalSystemProducts,
      s.totalScannedProducts,
      s.productsMatch,
      s.productsShortage,
      s.productsOverage,
      s.netDifferenceValue,
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 30 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
  ];
  applyCellFmt(ws, 19, 1, MONEY_FMT); // Valor estimado faltante
  applyCellFmt(ws, 20, 1, MONEY_FMT); // Valor estimado sobrante
  applyCellFmt(ws, 21, 1, MONEY_DIFF_FMT); // Valor neto de diferencia
  applyCellFmt(ws, 26, 5, MONEY_DIFF_FMT); // KPI VALOR DIFERENCIA
  return ws;
}

// Hoja 2: Detalle contado ─────────────────────────────────────────────────────
const DETAIL_HEADERS: Cell[] = [
  "SKU",
  "Código de barra",
  "Producto",
  "Laboratorio",
  "Marca",
  "Categoría",
  "Sucursal",
  "Lote",
  "Vencimiento",
  "Stock sistema",
  "Cantidad contada",
  "Diferencia",
  "Costo unitario",
  "Valor diferencia",
  "Estado",
  "Nota",
];

function detalleSheet(report: PhysicalCountReport): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    DETAIL_HEADERS,
    ...report.detail.map((d) => [
      d.sku,
      d.barcode,
      d.product,
      d.laboratory,
      d.brand,
      d.category,
      d.branch,
      d.lot,
      fmtDate(d.expiresAt),
      d.systemStock,
      d.counted,
      d.difference,
      d.unitCost,
      d.differenceValue,
      d.statusLabel,
      d.notes,
    ]),
  ];
  const widths = [16, 16, 30, 18, 16, 16, 18, 12, 12, 12, 14, 12, 14, 16, 12, 20];
  return buildSheet(aoa, widths, {
    11: DIFF_QTY_FMT,
    12: MONEY_FMT,
    13: MONEY_DIFF_FMT,
  });
}

// Hoja 3: Diferencias ─────────────────────────────────────────────────────────
const DIFF_HEADERS: Cell[] = [
  "Producto",
  "SKU",
  "Lote",
  "Sucursal",
  "Sistema",
  "Contado",
  "Diferencia",
  "Tipo diferencia",
  "Costo unitario",
  "Valor diferencia",
  "Acción recomendada",
  "Nota",
];

function diferenciasSheet(report: PhysicalCountReport): XLSX.WorkSheet {
  const widths = [30, 16, 12, 18, 10, 10, 12, 14, 14, 16, 20, 20];
  if (report.differences.length === 0) {
    return buildSheet(
      [DIFF_HEADERS, ["Sin diferencias: todo el inventario coincide."]],
      widths,
    );
  }
  const aoa: Cell[][] = [
    DIFF_HEADERS,
    ...report.differences.map((d) => [
      d.product,
      d.sku,
      d.lot,
      d.branch,
      d.system,
      d.counted,
      d.difference,
      d.diffType,
      d.unitCost,
      d.differenceValue,
      d.recommendedAction,
      d.notes,
    ]),
  ];
  return buildSheet(aoa, widths, { 6: DIFF_QTY_FMT, 8: MONEY_FMT, 9: MONEY_DIFF_FMT });
}

// Hoja 4: Escaneos ────────────────────────────────────────────────────────────
const SCAN_HEADERS: Cell[] = [
  "Fecha/hora",
  "Código escaneado",
  "Producto encontrado",
  "SKU",
  "Código de barra",
  "Sucursal",
  "Usuario",
  "Resultado",
  "Cantidad sumada",
  "Cantidad acumulada",
  "Dispositivo",
  "Nota",
];

function escaneosSheet(report: PhysicalCountReport): XLSX.WorkSheet {
  const widths = [18, 16, 30, 16, 16, 18, 18, 16, 14, 16, 18, 20];
  if (report.scans.length === 0) {
    return buildSheet(
      [SCAN_HEADERS, ["No se registraron escaneos en este inventario físico."]],
      widths,
    );
  }
  const aoa: Cell[][] = [
    SCAN_HEADERS,
    ...report.scans.map((s) => [
      fmtDateTime(s.dateTime),
      s.scannedCode,
      s.productFound,
      s.sku,
      s.barcode,
      s.branch,
      s.user,
      s.result,
      s.addedQty,
      s.accumulatedQty,
      s.device,
      s.notes,
    ]),
  ];
  return buildSheet(aoa, widths);
}

// Hoja 5: Productos no encontrados ────────────────────────────────────────────
const NOTFOUND_HEADERS: Cell[] = [
  "Fecha/hora",
  "Código escaneado",
  "Usuario",
  "Sucursal",
  "Cantidad de veces escaneado",
  "Acción sugerida",
  "Nota",
];

function noEncontradosSheet(report: PhysicalCountReport): XLSX.WorkSheet {
  const widths = [18, 18, 18, 18, 24, 22, 20];
  if (report.notFound.length === 0) {
    return buildSheet(
      [
        NOTFOUND_HEADERS,
        ["No se registraron códigos sin producto en este inventario físico."],
      ],
      widths,
    );
  }
  const aoa: Cell[][] = [
    NOTFOUND_HEADERS,
    ...report.notFound.map((n) => [
      fmtDateTime(n.dateTime),
      n.scannedCode,
      n.user,
      n.branch,
      n.timesScanned,
      n.suggestedAction,
      n.notes,
    ]),
  ];
  return buildSheet(aoa, widths);
}

// Hoja 6: Ajustes generados ───────────────────────────────────────────────────
const ADJ_HEADERS: Cell[] = [
  "Producto",
  "SKU",
  "Lote",
  "Sucursal",
  "Cantidad anterior",
  "Cantidad contada",
  "Ajuste",
  "Movimiento generado",
  "Usuario",
  "Fecha",
  "Motivo",
];

function ajustesSheet(report: PhysicalCountReport): XLSX.WorkSheet {
  const widths = [30, 16, 12, 18, 16, 16, 10, 22, 18, 18, 30];
  if (report.adjustments.length === 0) {
    return buildSheet(
      [ADJ_HEADERS, ["No se generaron ajustes para este inventario físico."]],
      widths,
    );
  }
  const aoa: Cell[][] = [
    ADJ_HEADERS,
    ...report.adjustments.map((a) => [
      a.product,
      a.sku,
      a.lot,
      a.branch,
      num(a.previousQty),
      num(a.countedQty),
      a.adjustment,
      a.movement,
      a.user,
      fmtDateTime(a.date),
      a.reason,
    ]),
  ];
  return buildSheet(aoa, widths, { 6: DIFF_QTY_FMT });
}

// ─── Libro completo ──────────────────────────────────────────────────────────

export function physicalCountWorkbook(report: PhysicalCountReport): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, resumenSheet(report), "Resumen");
  XLSX.utils.book_append_sheet(wb, detalleSheet(report), "Detalle contado");
  XLSX.utils.book_append_sheet(wb, diferenciasSheet(report), "Diferencias");
  XLSX.utils.book_append_sheet(wb, escaneosSheet(report), "Escaneos");
  XLSX.utils.book_append_sheet(wb, noEncontradosSheet(report), "Productos no encontrados");
  XLSX.utils.book_append_sheet(wb, ajustesSheet(report), "Ajustes generados");
  return wb;
}

export function physicalCountXlsxBytes(report: PhysicalCountReport): Uint8Array {
  const wb = physicalCountWorkbook(report);
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

function safeName(s: string): string {
  return s.replace(/[^0-9A-Za-z_-]+/g, "-").replace(/^-+|-+$/g, "") || "DermaLand";
}

/** Inventario-fisico-{sucursal}-{YYYY-MM-DD}.xlsx */
export function physicalCountFilename(
  branchName: string,
  dateIso: string,
): string {
  const date = (dateIso || "").slice(0, 10) || "sin-fecha";
  return `Inventario-fisico-${safeName(branchName)}-${date}.xlsx`;
}

// ─── Exportación de la lista de conteos (pantalla general) ───────────────────

const LIST_HEADERS: Cell[] = [
  "Conteo",
  "Sucursal",
  "Tipo",
  "Estado",
  "Fecha de inicio",
  "Fecha de cierre",
  "Escaneos",
  "Items",
  "Nota",
];

export function countsListWorkbook(
  rows: CountListRow[],
  businessName: string,
  generatedAt: string,
): XLSX.WorkBook {
  const aoa: Cell[][] = [
    [businessName || "DermaLand", null],
    ["Inventario físico — Conteos", null],
    ["Generado", fmtDateTime(generatedAt)],
    ["", null],
    LIST_HEADERS,
    ...rows.map((c) => [
      c.countNumber,
      c.branch,
      c.typeLabel,
      c.statusLabel,
      fmtDateTime(c.startedAt),
      fmtDateTime(c.closedAt),
      c.scans,
      c.items,
      c.notes,
    ]),
  ];
  const ws = buildSheet(
    aoa,
    [20, 20, 12, 14, 18, 18, 12, 10, 24],
    {},
    5,
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Conteos");
  return wb;
}

export function countsListXlsxBytes(
  rows: CountListRow[],
  businessName: string,
  generatedAt: string,
): Uint8Array {
  const wb = countsListWorkbook(rows, businessName, generatedAt);
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

export function countsListFilename(dateIso: string): string {
  const date = (dateIso || "").slice(0, 10) || "sin-fecha";
  return `Inventario-fisico-conteos-${date}.xlsx`;
}
