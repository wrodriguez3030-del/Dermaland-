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
import {
  ALCANCE_TOTAL_GASTADO,
  ETIQUETA_TOTAL_GASTADO,
  ETIQUETA_TOTAL_GASTADO_ACUMULADO,
} from "./alcance-total-gastado";

function customerColumns(): TableSpec["columns"] {
  return [
    { header: "Cliente", key: "name", width: 34 },
    { header: "Código", key: "code", width: 14 },
    { header: "Documento", key: "document", width: 18 },
    { header: "Teléfono", key: "phone", width: 16 },
    { header: "Compras", key: "purchases", format: "int" },
    { header: ETIQUETA_TOTAL_GASTADO, key: "totalSpent", format: "currency", width: 22 },
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

/**
 * 🔴 El alcance viaja SIEMPRE con la tabla, no lo pone quien llama.
 *
 * `TableSpec` no tiene clave de nota (`lib/reports/excel/types.ts`): el único
 * texto libre que el motor pinta encima de una tabla es su `title`. Este
 * archivo sale del edificio, así que la frase va aquí dentro — si dependiera de
 * que la pantalla la pase en `meta`, un caller nuevo exportaría el Excel sin
 * ella y nadie lo notaría.
 */
function tituloConAlcance(title?: string): string {
  return title ? `${title} — ${ALCANCE_TOTAL_GASTADO}` : ALCANCE_TOTAL_GASTADO;
}

function customersTable(rows: CustomerMetricsRow[], title?: string): TableSpec {
  return {
    title: tituloConAlcance(title),
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
      { label: ETIQUETA_TOTAL_GASTADO_ACUMULADO, value: kpis.totalSpent, format: "currency" },
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
