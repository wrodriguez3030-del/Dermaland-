import * as XLSX from "xlsx";
import type { IncentiveRecord } from "./incentive-store";
import { RULE_TYPE_LABEL, STATUS_LABEL } from "./incentive-store";
import { rankSellers, summarize } from "./incentive-report";
import { formatDateTime } from "@/lib/utils/format";

/**
 * Excel profesional de incentivos — 6 hojas: Resumen, Por vendedor, Detalle
 * por venta, Detalle por producto, Pagados, Pendientes. Presentación pura
 * (sin red). El módulo se carga on-demand (arrastra xlsx ~100 kB).
 */

const MONEY = '"RD$"#,##0.00';
type Cell = string | number | null;

function sheet(aoa: Cell[][], widths: number[], moneyCols: number[] = []): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  for (let r = 1; r < aoa.length; r++) {
    for (const c of moneyCols) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (cell && typeof cell.v === "number") {
        cell.t = "n";
        cell.z = MONEY;
      }
    }
  }
  return ws;
}

const PENDING = new Set(["pending", "approved"]);

export interface IncentiveExportMeta {
  businessName: string;
  generatedAt: string;
  rangeLabel: string;
  filtersLabel: string;
  branchName?: (id: string | undefined) => string;
}

function detailRow(i: IncentiveRecord, meta: IncentiveExportMeta): Cell[] {
  return [
    formatDateTime(i.earnedAt),
    i.saleNumber ?? "—",
    meta.branchName ? meta.branchName(i.saleBranchId) : (i.saleBranchId ?? "—"),
    i.sellerName ?? "—",
    i.saleCashier ?? "—",
    i.saleCustomer ?? "—",
    i.ruleName ?? "—",
    i.ruleType ? (RULE_TYPE_LABEL[i.ruleType as keyof typeof RULE_TYPE_LABEL] ?? i.ruleType) : "—",
    i.baseAmount,
    i.incentiveAmount,
    STATUS_LABEL[i.status],
    i.paidAt ? formatDateTime(i.paidAt) : "—",
  ];
}

const DETAIL_HEADERS = [
  "Fecha",
  "Factura",
  "Sucursal",
  "Vendedor",
  "Cajero",
  "Cliente",
  "Regla incentivo",
  "Tipo",
  "Base (venta neta)",
  "Incentivo",
  "Estado",
  "Fecha pago",
];
const DETAIL_WIDTHS = [18, 16, 20, 22, 20, 24, 24, 18, 16, 14, 12, 18];
const DETAIL_MONEY = [8, 9];

export function buildIncentivesWorkbook(
  incentives: IncentiveRecord[],
  meta: IncentiveExportMeta,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const s = summarize(incentives);
  const ranking = rankSellers(incentives);

  // 1. Resumen
  const resumen: Cell[][] = [
    [meta.businessName || "DermaLand", null],
    ["Reporte de incentivos", null],
    ["Rango", meta.rangeLabel],
    ["Filtros", meta.filtersLabel],
    ["Generado", formatDateTime(meta.generatedAt)],
    ["", null],
    ["Incentivos generados", s.generated],
    ["Pagados", s.paid],
    ["Pendientes", s.pending],
    ["Ventas incentivadas", s.incentivizedSales],
    ["Promedio por venta", s.avgPerSale],
    ["Vendedor con mayor incentivo", s.topSeller ?? "—"],
  ];
  const wsR = XLSX.utils.aoa_to_sheet(resumen);
  wsR["!cols"] = [{ wch: 34 }, { wch: 22 }];
  for (const r of [6, 7, 8, 10]) {
    const ref = XLSX.utils.encode_cell({ r, c: 1 });
    if (wsR[ref] && typeof wsR[ref].v === "number") wsR[ref].z = MONEY;
  }
  XLSX.utils.book_append_sheet(wb, wsR, "Resumen");

  // 2. Por vendedor (ranking)
  const porVendedor: Cell[][] = [
    ["Vendedor", "Ventas", "Generado", "Pagado", "Pendiente"],
    ...ranking.map((r) => [r.sellerName, r.sales, r.generated, r.paid, r.pending] as Cell[]),
  ];
  XLSX.utils.book_append_sheet(wb, sheet(porVendedor, [26, 10, 16, 16, 16], [2, 3, 4]), "Por vendedor");

  // 3. Detalle por venta
  const detalle: Cell[][] = [DETAIL_HEADERS, ...incentives.map((i) => detailRow(i, meta))];
  XLSX.utils.book_append_sheet(wb, sheet(detalle, DETAIL_WIDTHS, DETAIL_MONEY), "Detalle por venta");

  // 4. Detalle por producto (incentivos con producto asociado)
  const conProducto = incentives.filter((i) => i.productId);
  const porProducto: Cell[][] = [
    ["Producto (id)", "Vendedor", "Factura", "Base", "Incentivo", "Estado"],
    ...conProducto.map(
      (i) =>
        [i.productId ?? "—", i.sellerName ?? "—", i.saleNumber ?? "—", i.baseAmount, i.incentiveAmount, STATUS_LABEL[i.status]] as Cell[],
    ),
  ];
  XLSX.utils.book_append_sheet(wb, sheet(porProducto, [24, 22, 16, 14, 14, 12], [3, 4]), "Detalle por producto");

  // 5. Pagados
  const pagados = incentives.filter((i) => i.status === "paid");
  const hojaPagados: Cell[][] = [DETAIL_HEADERS, ...pagados.map((i) => detailRow(i, meta))];
  XLSX.utils.book_append_sheet(wb, sheet(hojaPagados, DETAIL_WIDTHS, DETAIL_MONEY), "Pagados");

  // 6. Pendientes
  const pendientes = incentives.filter((i) => PENDING.has(i.status));
  const hojaPend: Cell[][] = [DETAIL_HEADERS, ...pendientes.map((i) => detailRow(i, meta))];
  XLSX.utils.book_append_sheet(wb, sheet(hojaPend, DETAIL_WIDTHS, DETAIL_MONEY), "Pendientes");

  return wb;
}

export function incentivesXlsxBytes(
  incentives: IncentiveRecord[],
  meta: IncentiveExportMeta,
): Uint8Array {
  const wb = buildIncentivesWorkbook(incentives, meta);
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

export function incentivesFilename(stamp: string): string {
  const safe = stamp.replace(/[^0-9A-Za-z_-]+/g, "-");
  return `Incentivos-${safe}.xlsx`;
}
