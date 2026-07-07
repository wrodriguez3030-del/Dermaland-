// Spec PURO del Excel profesional del Reporte de Ventas (8 hojas).
//
// Toma el MISMO `SalesReport` que renderiza la pantalla (mismos filtros,
// mismos KPIs, mismas filas) y lo proyecta a un WorkbookSpec para el motor
// central `lib/reports/excel`. Sin red, sin fs, sin ExcelJS aquí: 100%
// testeable. NO toca DGII real ni datos.

import type { ReportMeta, SheetSpec, WorkbookSpec, TableSpec } from "@/lib/reports/excel/types";
import { toExcelDate } from "@/lib/reports/excel/excel-date";
import { formatCurrency } from "@/lib/utils/format";
import type { SalesReport, SalesTableRow } from "./sales-report";

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Método legible; ventas mixtas desglosan cada pago real. */
function detailMethodLabel(r: SalesTableRow): string {
  if (r.method !== "mixed") return r.methodLabel;
  const parts = r.methodParts.map((pt) => `${pt.label} ${formatCurrency(pt.amount)}`);
  return parts.length ? `Mixto: ${parts.join(" + ")}` : r.methodLabel;
}

function methodsTable(report: SalesReport): TableSpec {
  const methods = report.methods;
  const totalAmount = r2(methods.reduce((s, m) => s + m.amount, 0));
  const totalPayments = methods.reduce((s, m) => s + m.count, 0);
  const totalSales = report.kpis.transactions;
  return {
    title: "Métodos de pago",
    columns: [
      { header: "Método de pago", key: "label", width: 22 },
      { header: "Cantidad de pagos", key: "count", format: "int" },
      { header: "Cantidad de ventas", key: "sales", format: "int" },
      { header: "Monto total", key: "amount", format: "currency" },
      { header: "Porcentaje del total", key: "pct", format: "percent" },
      { header: "Ticket promedio por método", key: "avg", format: "currency", width: 26 },
    ],
    rows: methods.map((m) => ({
      label: m.label,
      count: m.count,
      sales: m.sales,
      amount: m.amount,
      pct: totalAmount > 0 ? m.amount / totalAmount : 0,
      avg: m.sales > 0 ? r2(m.amount / m.sales) : 0,
    })),
    totals: {
      label: "TOTAL",
      count: totalPayments,
      sales: totalSales,
      amount: totalAmount,
      pct: totalAmount > 0 ? 1 : 0,
      avg: totalSales > 0 ? r2(totalAmount / totalSales) : 0,
    },
  };
}

/** Construye el spec de 8 hojas: mismos números que la pantalla. */
export function buildSalesWorkbookSpec(
  report: SalesReport,
  meta: ReportMeta,
): WorkbookSpec {
  const k = report.kpis;

  const resumen: SheetSpec = {
    name: "Resumen",
    kpis: [
      { label: "Total facturado", value: k.totalBilled, format: "currency" },
      { label: "ITBIS recaudado", value: k.itbis, format: "currency" },
      { label: "Transacciones", value: k.transactions, format: "int" },
      { label: "Items vendidos", value: k.items, format: "int" },
      { label: "Ticket promedio", value: k.avgTicket, format: "currency" },
      { label: "Clientes distintos", value: k.distinctCustomers, format: "int" },
      { label: "Descuentos otorgados", value: k.discounts, format: "currency" },
      { label: "Devoluciones", value: k.refunds, format: "currency" },
      { label: "Neto después de devoluciones", value: k.net, format: "currency" },
      {
        label: "Margen estimado",
        value: k.marginEstimate ?? "N/D",
        format: k.marginEstimate == null ? "text" : "currency",
      },
    ],
    tables: [methodsTable(report)],
  };

  const detalle: SheetSpec = {
    name: "Ventas detalle",
    tables: [
      {
        columns: [
          { header: "Fecha y hora", key: "dateTime", format: "datetime" },
          { header: "Sucursal", key: "branchName", width: 18 },
          { header: "Comprobante", key: "comprobante", width: 18 },
          { header: "Tipo documento", key: "documentType", width: 24 },
          { header: "Cliente", key: "customer", width: 30 },
          { header: "Cajero", key: "cashier", width: 18 },
          { header: "Vendedor", key: "seller", width: 18 },
          { header: "Items", key: "items", format: "int" },
          { header: "Método de pago", key: "methodLabel", width: 24 },
          { header: "Subtotal", key: "subtotal", format: "currency" },
          { header: "ITBIS", key: "itbis", format: "currency" },
          { header: "Descuento", key: "discount", format: "currency" },
          { header: "Total", key: "total", format: "currency" },
          { header: "Estado", key: "statusLabel", width: 14 },
        ],
        rows: report.rows.map((r) => ({
          dateTime: toExcelDate(r.dateTime),
          branchName: r.branchName,
          comprobante: r.comprobante,
          documentType: r.documentType,
          customer: r.customer,
          cashier: r.cashier,
          seller: r.seller,
          items: r.items,
          methodLabel: detailMethodLabel(r),
          subtotal: r.subtotal,
          itbis: r.itbis,
          discount: r.discount,
          total: r.total,
          statusLabel: r.statusLabel,
        })),
        totals: {
          dateTime: "TOTALES",
          items: k.items,
          itbis: k.itbis,
          discount: k.discounts,
          total: k.totalBilled,
        },
      },
    ],
  };

  const metodos: SheetSpec = { name: "Métodos de pago", tables: [methodsTable(report)] };

  const porCajero: SheetSpec = {
    name: "Por cajero",
    tables: [
      {
        columns: [
          { header: "Cajero", key: "name", width: 28 },
          { header: "Transacciones", key: "transactions", format: "int" },
          { header: "Total", key: "total", format: "currency" },
        ],
        rows: report.cashiers.map((c) => ({ ...c })),
        totals: {
          name: "TOTAL",
          transactions: report.cashiers.reduce((s, c) => s + c.transactions, 0),
          total: r2(report.cashiers.reduce((s, c) => s + c.total, 0)),
        },
      },
    ],
  };

  const porVendedor: SheetSpec = {
    name: "Por vendedor",
    tables: [
      {
        columns: [
          { header: "Vendedor", key: "name", width: 28 },
          { header: "Ventas", key: "transactions", format: "int" },
          { header: "Total vendido", key: "total", format: "currency" },
          { header: "Ticket promedio", key: "avg", format: "currency" },
        ],
        rows: report.sellers.map((s) => ({
          ...s,
          avg: s.transactions ? r2(s.total / s.transactions) : 0,
        })),
        totals: {
          name: "TOTAL",
          transactions: report.sellers.reduce((s, x) => s + x.transactions, 0),
          total: r2(report.sellers.reduce((s, x) => s + x.total, 0)),
        },
      },
    ],
  };

  const porSucursal: SheetSpec = {
    name: "Por sucursal",
    tables: [
      {
        columns: [
          { header: "Sucursal", key: "name", width: 28 },
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
    ],
  };

  const productos: SheetSpec = {
    name: "Productos vendidos",
    tables: [
      {
        columns: [
          { header: "Producto", key: "name", width: 46 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Cantidad", key: "quantity", format: "int" },
          { header: "Total", key: "total", format: "currency" },
          { header: "Costo", key: "cost", format: "currency" },
          { header: "Margen", key: "margin", format: "currency" },
        ],
        rows: report.products.map((p) => ({
          name: p.name,
          sku: p.sku,
          quantity: p.quantity,
          total: p.total,
          cost: p.cost,
          margin: p.margin,
        })),
        totals: {
          name: "TOTAL",
          quantity: report.products.reduce((s, p) => s + p.quantity, 0),
          total: r2(report.products.reduce((s, p) => s + p.total, 0)),
        },
      },
    ],
  };

  const clientes: SheetSpec = {
    name: "Clientes",
    tables: [
      {
        columns: [
          { header: "Cliente", key: "name", width: 32 },
          { header: "Documento", key: "document", width: 18 },
          { header: "Teléfono", key: "phone", width: 16 },
          { header: "Compras", key: "purchases", format: "int" },
          { header: "Total gastado", key: "total", format: "currency" },
        ],
        rows: report.customers.map((c) => ({ ...c })),
        totals: {
          name: "TOTAL",
          purchases: report.customers.reduce((s, c) => s + c.purchases, 0),
          total: r2(report.customers.reduce((s, c) => s + c.total, 0)),
        },
      },
    ],
  };

  return {
    meta,
    sheets: [
      resumen,
      detalle,
      metodos,
      porCajero,
      porVendedor,
      porSucursal,
      productos,
      clientes,
    ],
  };
}
