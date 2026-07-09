// Spec PURO del PDF profesional del Reporte de Comisión de Ventas.
// Mismos datos que pantalla y Excel (motor `commission-engine`) → §21.

import type { ReportPdfMeta, ReportPdfSpec, PdfSection } from "@/lib/reports/pdf/types";
import type { CommissionLine, CommissionReport } from "./commission-engine";

function displayStatus(l: CommissionLine): string {
  return l.status === "commissionable" ? l.payoutLabel : l.statusLabel;
}

export function buildCommissionPdfSpec(
  report: CommissionReport,
  meta: ReportPdfMeta,
): ReportPdfSpec {
  const k = report.kpis;

  const detalle: PdfSection = {
    title: "Detalle de comisiones",
    table: {
      columns: [
        { header: "Fecha", key: "date", format: "date" },
        { header: "Comprobante", key: "comprobante", weight: 1.3 },
        { header: "Vendedor", key: "seller", weight: 1.5 },
        { header: "Método", key: "method", weight: 1 },
        { header: "Base", key: "base", format: "currency" },
        { header: "%", key: "rate", format: "percent" },
        { header: "Comisión", key: "commission", format: "currency" },
        { header: "Estado", key: "estado", weight: 1 },
      ],
      rows: report.rows.map((l) => ({
        date: l.date,
        comprobante: l.comprobante,
        seller: l.seller,
        method: l.methodLabel,
        base: l.base,
        rate: l.ratePercent / 100,
        commission: l.commission,
        estado: displayStatus(l),
      })),
      emptyMessage: "Sin ventas en el período seleccionado.",
    },
  };

  const porVendedor: PdfSection = {
    title: "Resumen por vendedor",
    table: {
      columns: [
        { header: "Vendedor", key: "seller", weight: 2 },
        { header: "Ventas", key: "sales", format: "int" },
        { header: "Base", key: "base", format: "currency" },
        { header: "Comisión 3%", key: "c3", format: "currency" },
        { header: "Comisión 1%", key: "c1", format: "currency" },
        { header: "Comisión total", key: "total", format: "currency" },
        { header: "Pendiente", key: "pending", format: "currency" },
      ],
      rows: report.bySeller.map((r) => ({
        seller: r.sellerName,
        sales: r.sales,
        base: r.base,
        c3: r.commission3,
        c1: r.commission1,
        total: r.commissionTotal,
        pending: r.pending,
      })),
      emptyMessage: "Sin comisiones por vendedor.",
    },
  };

  const porMetodo: PdfSection = {
    title: "Resumen por método de pago",
    table: {
      columns: [
        { header: "Método", key: "method", weight: 2 },
        { header: "Ventas", key: "sales", format: "int" },
        { header: "Base", key: "base", format: "currency" },
        { header: "%", key: "rate", format: "percent" },
        { header: "Comisión", key: "commission", format: "currency" },
      ],
      rows: report.byMethod.map((r) => ({
        method: r.label,
        sales: r.sales,
        base: r.base,
        rate: r.ratePercent / 100,
        commission: r.commission,
      })),
      emptyMessage: "Sin comisiones por método.",
    },
  };

  return {
    meta,
    orientation: "landscape",
    kpis: [
      { label: "Base comisionable", value: k.commissionableBase, format: "currency" },
      { label: "Comisión 3%", value: k.commission3, format: "currency" },
      { label: "Comisión 1%", value: k.commission1, format: "currency" },
      { label: "Comisión total", value: k.commissionTotal, format: "currency" },
    ],
    sections: [detalle, porVendedor, porMetodo],
  };
}
