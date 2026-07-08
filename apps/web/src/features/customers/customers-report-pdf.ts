// Spec PURO del PDF profesional del Reporte de Clientes.
//
// Usa la MISMA capa central de métricas (customer-metrics) que el perfil y el
// Excel → total gastado / compras / ticket coinciden con el perfil del cliente.

import type { ReportPdfMeta, ReportPdfSpec, PdfSection } from "@/lib/reports/pdf/types";
import {
  computeCustomersReportKpis,
  isVipCustomer,
  type CustomerMetricsRow,
} from "./customer-metrics";
import { skinTypeLabel } from "./billing";

export function buildCustomersPdfSpec(
  rows: CustomerMetricsRow[],
  meta: ReportPdfMeta,
): ReportPdfSpec {
  const kpis = computeCustomersReportKpis(rows);
  const ranked = [...rows].sort((a, b) => b.stats.totalSpent - a.stats.totalSpent);

  const section: PdfSection = {
    title: "Clientes por gasto",
    table: {
      columns: [
        { header: "No.", key: "_i", format: "index" },
        { header: "Cliente", key: "name", weight: 2 },
        { header: "Compras", key: "purchases", format: "int" },
        { header: "Total gastado", key: "totalSpent", format: "currency" },
        { header: "Ticket promedio", key: "avgTicket", format: "currency" },
        { header: "Última visita", key: "lastVisit", format: "date" },
        { header: "Segmento", key: "segment", weight: 1.2 },
      ],
      rows: ranked.map((r) => {
        const { customer: c, stats } = r;
        const segment = [isVipCustomer(c, stats) ? "VIP" : null, skinTypeLabel(c.skinType)]
          .filter(Boolean)
          .join(" · ");
        return {
          name: `${c.firstName} ${c.lastName}`,
          purchases: stats.purchases,
          totalSpent: stats.totalSpent,
          avgTicket: stats.avgTicket,
          lastVisit: stats.lastVisitAt ?? null,
          segment,
        };
      }),
      totals: {
        name: "TOTAL",
        purchases: kpis.totalPurchases,
        totalSpent: kpis.totalSpent,
      },
      emptyMessage: "Sin clientes para mostrar.",
    },
  };

  return {
    meta,
    orientation: "portrait",
    kpis: [
      { label: "Clientes activos", value: kpis.activeCustomers, format: "int" },
      { label: "Total gastado", value: kpis.totalSpent, format: "currency" },
      { label: "Ticket promedio", value: kpis.avgTicket, format: "currency" },
      { label: "Clientes VIP", value: kpis.vipCustomers, format: "int" },
    ],
    sections: [section],
  };
}
