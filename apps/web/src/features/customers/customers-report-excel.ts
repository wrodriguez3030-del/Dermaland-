// Spec PURO del Excel profesional del Reporte de Clientes.
//
// Usa las MISMAS filas de la capa central de métricas (customer-metrics)
// que renderiza la pantalla — paridad garantizada con el perfil del cliente.

import type {
  ReportMeta,
  SheetSpec,
  TableSpec,
  WorkbookSpec,
} from "@/lib/reports/excel/types";
import { toExcelDate } from "@/lib/reports/excel/excel-date";
import {
  computeCustomersReportKpis,
  isVipCustomer,
  type CustomerMetricsRow,
} from "./customer-metrics";
import { skinTypeLabel } from "./billing";

function customerColumns(): TableSpec["columns"] {
  return [
    { header: "Cliente", key: "name", width: 34 },
    { header: "Código", key: "code", width: 14 },
    { header: "Documento", key: "document", width: 18 },
    { header: "Teléfono", key: "phone", width: 16 },
    { header: "Compras", key: "purchases", format: "int" },
    { header: "Total gastado", key: "totalSpent", format: "currency" },
    { header: "Ticket promedio", key: "avgTicket", format: "currency" },
    { header: "Última visita", key: "lastVisit", format: "date" },
    { header: "Segmento", key: "segment", width: 20 },
  ];
}

function customerRow(r: CustomerMetricsRow) {
  const { customer: c, stats } = r;
  const segment = [
    isVipCustomer(c, stats) ? "VIP" : null,
    skinTypeLabel(c.skinType),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    name: `${c.firstName} ${c.lastName}`,
    code: c.customerNumber,
    document: c.documentNumber ?? "—",
    phone: c.phone ?? c.whatsapp ?? "—",
    purchases: stats.purchases,
    totalSpent: stats.totalSpent,
    avgTicket: stats.avgTicket,
    lastVisit: stats.lastVisitAt ? toExcelDate(stats.lastVisitAt) : null,
    segment,
  };
}

function customersTable(rows: CustomerMetricsRow[], title?: string): TableSpec {
  return {
    title,
    columns: customerColumns(),
    rows: rows.map(customerRow),
    totals: {
      name: "TOTAL",
      purchases: rows.reduce((s, r) => s + r.stats.purchases, 0),
      totalSpent: rows.reduce((s, r) => s + r.stats.totalSpent, 0),
    },
  };
}

export function buildCustomersWorkbookSpec(
  rows: CustomerMetricsRow[],
  meta: ReportMeta,
): WorkbookSpec {
  const kpis = computeCustomersReportKpis(rows);

  const bySpend = [...rows].sort(
    (a, b) => b.stats.totalSpent - a.stats.totalSpent,
  );
  const frequent = [...rows]
    .filter((r) => r.stats.purchases > 0)
    .sort((a, b) => b.stats.purchases - a.stats.purchases);
  const byTicket = [...rows]
    .filter((r) => r.stats.purchases > 0)
    .sort((a, b) => b.stats.avgTicket - a.stats.avgTicket);
  const byLastVisit = [...rows]
    .filter((r) => r.stats.lastVisitAt)
    .sort((a, b) =>
      (b.stats.lastVisitAt ?? "").localeCompare(a.stats.lastVisitAt ?? ""),
    );

  const tagCount = new Map<string, number>();
  for (const { customer: c } of rows) {
    for (const t of c.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }

  const resumen: SheetSpec = {
    name: "Resumen",
    kpis: [
      { label: "Clientes totales", value: kpis.totalCustomers, format: "int" },
      { label: "Clientes activos (con compras)", value: kpis.activeCustomers, format: "int" },
      { label: "Total gastado acumulado", value: kpis.totalSpent, format: "currency" },
      { label: "Compras totales", value: kpis.totalPurchases, format: "int" },
      { label: "Ticket promedio", value: kpis.avgTicket, format: "currency" },
      { label: "Clientes VIP", value: kpis.vipCustomers, format: "int" },
    ],
    tables: [customersTable(bySpend.slice(0, 20), "Top 20 clientes por gasto")],
  };

  const segmentacion: SheetSpec = {
    name: "Segmentación",
    tables: [
      {
        title: "Clientes por etiqueta",
        columns: [
          { header: "Etiqueta", key: "tag", width: 24 },
          { header: "Clientes", key: "count", format: "int" },
        ],
        rows: [...tagCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([tag, count]) => ({ tag, count })),
      },
    ],
  };

  return {
    meta,
    sheets: [
      resumen,
      { name: "Clientes por gasto", tables: [customersTable(bySpend)] },
      { name: "Clientes frecuentes", tables: [customersTable(frequent)] },
      { name: "Ticket promedio", tables: [customersTable(byTicket)] },
      { name: "Última visita", tables: [customersTable(byLastVisit)] },
      segmentacion,
    ],
  };
}
