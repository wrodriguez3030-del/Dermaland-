// Spec PURO del Excel profesional del Reporte de Comisión de Ventas.
//
// Usa los MISMOS agregados que la pantalla (motor `commission-engine`) → §21.
// 9 hojas: Resumen, Detalle, Por vendedor, Por método, Por sucursal, Pendientes,
// Pagadas, Excluidas, Ajustes. Compatible con el Excel de referencia (§18).

import type { ReportMeta, SheetSpec, TableSpec, WorkbookSpec } from "@/lib/reports/excel/types";
import type {
  CommissionLine,
  CommissionReport,
} from "./commission-engine";

/** Estado visible: comisionable muestra su estado de PAGO; el resto su estado. */
function displayStatus(l: CommissionLine): string {
  return l.status === "commissionable" ? l.payoutLabel : l.statusLabel;
}

function detalleTable(rows: CommissionLine[]): TableSpec {
  return {
    columns: [
      { header: "Número de comprobante", key: "comprobante", width: 20 },
      { header: "Método de pago", key: "method", width: 16 },
      { header: "Fecha", key: "date", format: "date" },
      { header: "Sucursal", key: "branch", width: 18 },
      { header: "Cliente", key: "customer", width: 26 },
      { header: "Vendedor", key: "seller", width: 20 },
      { header: "Cajero", key: "cashier", width: 20 },
      { header: "Subtotal", key: "subtotal", format: "currency" },
      { header: "Descuento", key: "discount", format: "currency" },
      { header: "Antes de impuestos", key: "base", format: "currency" },
      { header: "Comisión 3%", key: "com3", format: "currency" },
      { header: "Comisión 1%", key: "com1", format: "currency" },
      { header: "Otra comisión", key: "other", format: "currency" },
      { header: "Impuestos", key: "itbis", format: "currency" },
      { header: "Después de impuestos", key: "total", format: "currency" },
      { header: "Regla", key: "rule", width: 22 },
      { header: "Estado", key: "estado", width: 14 },
      { header: "Fecha de pago", key: "paidAt", format: "date" },
    ],
    rows: rows.map((l) => ({
      comprobante: l.comprobante,
      method: l.methodLabel,
      date: l.date ? new Date(l.date) : null,
      branch: l.branchName,
      customer: l.customer,
      seller: l.seller,
      cashier: l.cashier,
      subtotal: l.subtotal,
      discount: l.discount,
      base: l.base,
      com3: l.status === "commissionable" && l.ratePercent === 3 ? l.commission : null,
      com1: l.status === "commissionable" && l.ratePercent === 1 ? l.commission : null,
      other:
        l.status === "commissionable" && l.ratePercent !== 3 && l.ratePercent !== 1
          ? l.commission
          : null,
      itbis: l.itbis,
      total: l.total,
      rule: l.ruleName,
      estado: displayStatus(l),
      paidAt: null, // Fase 2 (persistencia de pago)
    })),
    totals: {
      comprobante: "TOTAL",
      subtotal: rows.reduce((s, l) => s + l.subtotal, 0),
      discount: rows.reduce((s, l) => s + l.discount, 0),
      base: rows.reduce((s, l) => s + (l.status === "commissionable" ? l.base : 0), 0),
      com3: rows.reduce((s, l) => s + (l.status === "commissionable" && l.ratePercent === 3 ? l.commission : 0), 0),
      com1: rows.reduce((s, l) => s + (l.status === "commissionable" && l.ratePercent === 1 ? l.commission : 0), 0),
      itbis: rows.reduce((s, l) => s + l.itbis, 0),
      total: rows.reduce((s, l) => s + l.total, 0),
    },
  };
}

function sellerTable(report: CommissionReport): TableSpec {
  const s = report.bySeller;
  return {
    columns: [
      { header: "Vendedor", key: "seller", width: 26 },
      { header: "Ventas", key: "sales", format: "int" },
      { header: "Base comisionable", key: "base", format: "currency" },
      { header: "Comisión 3%", key: "c3", format: "currency" },
      { header: "Comisión 1%", key: "c1", format: "currency" },
      { header: "Otros incentivos", key: "other", format: "currency" },
      { header: "Comisión total", key: "total", format: "currency" },
      { header: "Pagado", key: "paid", format: "currency" },
      { header: "Pendiente", key: "pending", format: "currency" },
    ],
    rows: s.map((r) => ({
      seller: r.sellerName,
      sales: r.sales,
      base: r.base,
      c3: r.commission3,
      c1: r.commission1,
      other: r.otherIncentives,
      total: r.commissionTotal,
      paid: r.paid,
      pending: r.pending,
    })),
    totals: {
      seller: "TOTAL",
      sales: s.reduce((a, r) => a + r.sales, 0),
      base: s.reduce((a, r) => a + r.base, 0),
      c3: s.reduce((a, r) => a + r.commission3, 0),
      c1: s.reduce((a, r) => a + r.commission1, 0),
      other: s.reduce((a, r) => a + r.otherIncentives, 0),
      total: s.reduce((a, r) => a + r.commissionTotal, 0),
      paid: s.reduce((a, r) => a + r.paid, 0),
      pending: s.reduce((a, r) => a + r.pending, 0),
    },
  };
}

function methodTable(report: CommissionReport): TableSpec {
  const m = report.byMethod;
  return {
    columns: [
      { header: "Método", key: "method", width: 18 },
      { header: "Ventas", key: "sales", format: "int" },
      { header: "Base comisionable", key: "base", format: "currency" },
      { header: "%", key: "rate", format: "percent" },
      { header: "Comisión", key: "commission", format: "currency" },
    ],
    rows: m.map((r) => ({
      method: r.label,
      sales: r.sales,
      base: r.base,
      rate: r.ratePercent / 100, // percent espera 0-1
      commission: r.commission,
    })),
    totals: {
      method: "TOTAL",
      sales: m.reduce((a, r) => a + r.sales, 0),
      base: m.reduce((a, r) => a + r.base, 0),
      commission: m.reduce((a, r) => a + r.commission, 0),
    },
  };
}

function branchTable(report: CommissionReport): TableSpec {
  const b = report.byBranch;
  return {
    columns: [
      { header: "Sucursal", key: "branch", width: 24 },
      { header: "Ventas", key: "sales", format: "int" },
      { header: "Base comisionable", key: "base", format: "currency" },
      { header: "Comisión", key: "commission", format: "currency" },
      { header: "Pagada", key: "paid", format: "currency" },
      { header: "Pendiente", key: "pending", format: "currency" },
    ],
    rows: b.map((r) => ({
      branch: r.branchName,
      sales: r.sales,
      base: r.base,
      commission: r.commission,
      paid: r.paid,
      pending: r.pending,
    })),
    totals: {
      branch: "TOTAL",
      sales: b.reduce((a, r) => a + r.sales, 0),
      base: b.reduce((a, r) => a + r.base, 0),
      commission: b.reduce((a, r) => a + r.commission, 0),
      paid: b.reduce((a, r) => a + r.paid, 0),
      pending: b.reduce((a, r) => a + r.pending, 0),
    },
  };
}

export function buildCommissionWorkbookSpec(
  report: CommissionReport,
  meta: ReportMeta,
): WorkbookSpec {
  const k = report.kpis;

  const commissionable = report.rows.filter((l) => l.status === "commissionable");
  const pending = commissionable.filter((l) => l.payout !== "paid");
  const paid = commissionable.filter((l) => l.payout === "paid");
  const excluded = report.rows.filter((l) => l.status !== "commissionable");

  const resumen: SheetSpec = {
    name: "Resumen",
    kpis: [
      { label: "Ventas comisionables", value: k.commissionableSales, format: "int" },
      { label: "Base comisionable", value: k.commissionableBase, format: "currency" },
      { label: "Comisión 3%", value: k.commission3, format: "currency" },
      { label: "Comisión 1%", value: k.commission1, format: "currency" },
      { label: "Otras comisiones", value: k.otherCommission, format: "currency" },
      { label: "Comisión total", value: k.commissionTotal, format: "currency" },
      { label: "Pendiente de pago", value: k.pendingCommission, format: "currency" },
      { label: "Pagada", value: k.paidCommission, format: "currency" },
      { label: "Ventas excluidas", value: k.excludedSales, format: "int" },
    ],
    tables: [{ ...sellerTable(report), title: "Comisión por vendedor" }],
  };

  const ajustes: SheetSpec = {
    name: "Ajustes",
    tables: [
      {
        title: "Ajustes de comisión (Fase 2)",
        columns: [
          { header: "Fecha", key: "date", format: "date" },
          { header: "Comprobante", key: "comprobante", width: 20 },
          { header: "Vendedor", key: "seller", width: 22 },
          { header: "Motivo", key: "reason", width: 30 },
          { header: "Monto", key: "amount", format: "currency" },
        ],
        rows: [],
      },
    ],
  };

  return {
    meta,
    sheets: [
      resumen,
      { name: "Detalle comisiones", tables: [detalleTable(report.rows)] },
      { name: "Por vendedor", tables: [sellerTable(report)] },
      { name: "Por método de pago", tables: [methodTable(report)] },
      { name: "Por sucursal", tables: [branchTable(report)] },
      { name: "Pendientes", tables: [detalleTable(pending)] },
      { name: "Pagadas", tables: [detalleTable(paid)] },
      { name: "Excluidas", tables: [detalleTable(excluded)] },
      ajustes,
    ],
  };
}
