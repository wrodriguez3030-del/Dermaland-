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
import {
  ALCANCE_TOTAL_GASTADO,
  ETIQUETA_TOTAL_GASTADO,
} from "./alcance-total-gastado";

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
        { header: ETIQUETA_TOTAL_GASTADO, key: "totalSpent", format: "currency" },
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
    // 🔴 `footnote` a nivel de `PdfSection` es lo ÚNICO que el motor pinta bajo
    // una tabla (`server/services/reports/report-pdf.ts`): una `note` dentro de
    // `table` se descarta en silencio. Este papel sale del edificio y no puede
    // callarse qué cuenta su columna de dinero.
    footnote: ALCANCE_TOTAL_GASTADO,
  };

  return {
    meta,
    orientation: "portrait",
    kpis: [
      { label: "Clientes activos", value: kpis.activeCustomers, format: "int" },
      { label: ETIQUETA_TOTAL_GASTADO, value: kpis.totalSpent, format: "currency" },
      { label: "Ticket promedio", value: kpis.avgTicket, format: "currency" },
      { label: "Clientes VIP", value: kpis.vipCustomers, format: "int" },
    ],
    sections: [section],
  };
}
