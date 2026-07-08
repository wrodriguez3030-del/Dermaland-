// Spec PURO del PDF profesional del Reporte de Ventas.
//
// Toma el MISMO `SalesReport` que renderiza la pantalla y exporta el Excel →
// los totales coinciden. Columnas curadas para caber en página (menos que el
// Excel). Sin ExcelJS ni pdfkit aquí: 100% testeable.

import type { ReportPdfMeta, ReportPdfSpec, PdfSection } from "@/lib/reports/pdf/types";
import type { SalesReport, SalesTableRow } from "./sales-report";
import { formatCurrency } from "@/lib/utils/format";

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function methodLabel(r: SalesTableRow): string {
  if (r.method !== "mixed") return r.methodLabel;
  const parts = r.methodParts.map((p) => `${p.label} ${formatCurrency(p.amount)}`);
  return parts.length ? `Mixto: ${parts.join(" + ")}` : r.methodLabel;
}

export function buildSalesPdfSpec(
  report: SalesReport,
  meta: ReportPdfMeta,
): ReportPdfSpec {
  const k = report.kpis;
  const methods = report.methods;
  const totalMethods = r2(methods.reduce((s, m) => s + m.amount, 0));

  const detalle: PdfSection = {
    title: "Ventas detalle",
    table: {
      columns: [
        { header: "No.", key: "_i", format: "index" },
        { header: "Fecha", key: "date", format: "datetime" },
        { header: "Comprobante", key: "comprobante", weight: 1.1 },
        { header: "Cliente", key: "customer", weight: 1.6 },
        { header: "Cajero", key: "cashier", weight: 1 },
        { header: "Vendedor", key: "seller", weight: 1 },
        { header: "Método", key: "method", weight: 1 },
        { header: "Total", key: "total", format: "currency" },
      ],
      rows: report.rows.map((r) => ({
        date: r.dateTime,
        comprobante: r.comprobante,
        customer: r.customer,
        cashier: r.cashier,
        seller: r.seller,
        method: methodLabel(r),
        total: r.total,
      })),
      totals: { total: k.totalBilled },
      emptyMessage: "Sin ventas en el período seleccionado.",
    },
  };

  const porMetodo: PdfSection = {
    title: "Ventas por método de pago",
    table: {
      columns: [
        { header: "Método", key: "label", weight: 1.4 },
        { header: "Transacciones", key: "count", format: "int" },
        { header: "Monto", key: "amount", format: "currency" },
        { header: "% del total", key: "pct", format: "percent" },
      ],
      rows: methods.map((m) => ({
        label: m.label,
        count: m.count,
        amount: m.amount,
        pct: totalMethods > 0 ? m.amount / totalMethods : 0,
      })),
      totals: { label: "TOTAL", amount: totalMethods, pct: totalMethods > 0 ? 1 : 0 },
    },
  };

  const porVendedor: PdfSection = {
    title: "Ventas por vendedor",
    table: {
      columns: [
        { header: "Vendedor", key: "name", weight: 1.6 },
        { header: "Ventas", key: "transactions", format: "int" },
        { header: "Total vendido", key: "total", format: "currency" },
      ],
      rows: report.sellers.map((s) => ({ ...s })),
      totals: {
        name: "TOTAL",
        transactions: report.sellers.reduce((s, x) => s + x.transactions, 0),
        total: r2(report.sellers.reduce((s, x) => s + x.total, 0)),
      },
      emptyMessage: "Sin vendedores en el período.",
    },
  };

  const porSucursal: PdfSection = {
    title: "Ventas por sucursal",
    table: {
      columns: [
        { header: "Sucursal", key: "name", weight: 1.6 },
        { header: "Transacciones", key: "transactions", format: "int" },
        { header: "Total", key: "total", format: "currency" },
      ],
      rows: report.branches.map((b) => ({ ...b })),
      totals: {
        name: "TOTAL",
        transactions: report.branches.reduce((s, b) => s + b.transactions, 0),
        total: r2(report.branches.reduce((s, b) => s + b.total, 0)),
      },
    },
  };

  const topProductos: PdfSection = {
    title: "Productos más vendidos",
    table: {
      columns: [
        { header: "No.", key: "_i", format: "index" },
        { header: "Producto", key: "name", weight: 2 },
        { header: "Cantidad", key: "quantity", format: "int" },
        { header: "Total", key: "total", format: "currency" },
      ],
      rows: report.products.slice(0, 25).map((p) => ({
        name: p.name,
        quantity: p.quantity,
        total: p.total,
      })),
    },
  };

  return {
    meta,
    orientation: "landscape",
    kpis: [
      { label: "Total facturado", value: k.totalBilled, format: "currency" },
      { label: "ITBIS recaudado", value: k.itbis, format: "currency" },
      { label: "Transacciones", value: k.transactions, format: "int" },
      { label: "Items vendidos", value: k.items, format: "int" },
      { label: "Ticket promedio", value: k.avgTicket, format: "currency" },
    ],
    sections: [detalle, porMetodo, porVendedor, porSucursal, topProductos],
  };
}
