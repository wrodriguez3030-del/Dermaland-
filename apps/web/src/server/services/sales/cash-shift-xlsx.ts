// Genera el reporte Excel (.xlsx) del "Detalle del turno de caja".
//
// Presentación pura: arma un libro con SheetJS en memoria (Buffer), sin red ni
// fs. NO toca DGII real, secuencias ni datos. Es un reporte operativo de caja.

import * as XLSX from "xlsx";
import type { ShiftDetail } from "@/features/sales/cash-session-detail";

const MONEY_FMT = '"RD$"#,##0.00';

function formatDate(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface ShiftXlsxMeta {
  businessName: string;
  generatedAt: string;
}

/** Construye el Buffer .xlsx del detalle del turno. */
export function generateShiftXlsx(
  detail: ShiftDetail,
  meta: ShiftXlsxMeta,
): Buffer {
  // Cada fila: [label, value, isMoney]. value null = fila de sección/encabezado.
  type Row = [string, number | string | null, boolean];
  const rows: Row[] = [
    [meta.businessName || "DermaLand", null, false],
    ["Detalle del turno de caja", null, false],
    ["", null, false],
    ["Sucursal", detail.branchName ?? "—", false],
    ["Cajero", detail.cashierName, false],
    ["Sesión", detail.sessionNumber, false],
    ["Fecha de inicio", formatDate(detail.openedAt), false],
    ["Generado", formatDate(meta.generatedAt), false],
    ["", null, false],
    ["VENTAS DEL TURNO", null, false],
    ["Total de ventas", detail.totalSales, true],
    ["Ventas en efectivo", detail.salesCash, true],
    ["Ventas por tarjeta", detail.salesCard, true],
    ["Ventas por transferencia", detail.salesTransfer, true],
    ["Otros métodos", detail.salesOther, true],
    ["", null, false],
    ["MOVIMIENTOS DE EFECTIVO", null, false],
    ["Base inicial", detail.openingAmount, true],
    ["Ingresos en efectivo", detail.cashIncome, true],
    ["Retiros de efectivo", detail.cashWithdrawal, true],
    ["Devolución de dinero", detail.refundsCash, true],
    ["Total de movimientos del turno", detail.totalShiftMovements, true],
    ["", null, false],
    ["DINERO ESPERADO EN CAJA", detail.expectedCash, true],
    [
      "Efectivo contado",
      detail.countedCash != null ? detail.countedCash : "—",
      detail.countedCash != null,
    ],
    [
      "Diferencia",
      detail.difference != null ? detail.difference : "—",
      detail.difference != null,
    ],
  ];

  const aoa = rows.map(([label, value]) => [label, value]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Anchos de columna para que se lea profesional.
  ws["!cols"] = [{ wch: 34 }, { wch: 18 }];

  // Formato de moneda en la columna B donde corresponde.
  rows.forEach((row, i) => {
    const [, value, isMoney] = row;
    if (!isMoney || typeof value !== "number") return;
    const ref = XLSX.utils.encode_cell({ r: i, c: 1 });
    const cell = ws[ref];
    if (cell) {
      cell.t = "n";
      cell.z = MONEY_FMT;
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Turno de caja");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
  return out;
}

/** Nombre de archivo sugerido: Turno-CAJA-001.xlsx */
export function shiftXlsxFilename(detail: ShiftDetail): string {
  const safe = (detail.sessionNumber || "turno").replace(
    /[^A-Za-z0-9_-]+/g,
    "-",
  );
  return `Turno-${safe}.xlsx`;
}
