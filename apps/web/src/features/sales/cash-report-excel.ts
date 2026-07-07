// Spec PURO del Excel profesional del Reporte de Caja.
//
// Usa las MISMAS sesiones (y sus totales por método, calculados por el
// módulo de Caja) que muestra la pantalla Reportes > Caja. Sin ExcelJS aquí.

import type {
  ReportMeta,
  SheetSpec,
  WorkbookSpec,
} from "@/lib/reports/excel/types";
import { toExcelDate } from "@/lib/reports/excel/excel-date";
import type { CashRegisterSession, PaymentMethod } from "@/types";
import {
  PAYMENT_GROUP_LABEL,
  paymentMethodGroup,
  type PaymentGroup,
} from "./sales-report";

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Totales de la sesión agrupados a efectivo/tarjeta/transferencia/otro. */
export function sessionMethodGroups(
  s: CashRegisterSession,
): Record<PaymentGroup, number> {
  const out: Record<PaymentGroup, number> = {
    cash: 0,
    card: 0,
    transfer: 0,
    other: 0,
  };
  for (const [method, amount] of Object.entries(s.totals ?? {})) {
    out[paymentMethodGroup(method as PaymentMethod)] += Number(amount) || 0;
  }
  return out;
}

export function buildCashWorkbookSpec(
  sessions: CashRegisterSession[],
  meta: ReportMeta,
): WorkbookSpec {
  const openingTotal = r2(sessions.reduce((s, x) => s + x.openingAmount, 0));
  const expectedTotal = r2(sessions.reduce((s, x) => s + x.expectedCash, 0));
  const countedTotal = r2(
    sessions.reduce((s, x) => s + (x.countedCash ?? 0), 0),
  );
  const differenceTotal = r2(
    sessions
      .filter((x) => x.difference != null)
      .reduce((s, x) => s + (x.difference ?? 0), 0),
  );
  const withDiff = sessions.filter(
    (s) => s.difference != null && s.difference !== 0,
  );

  const groupTotals: Record<PaymentGroup, number> = {
    cash: 0,
    card: 0,
    transfer: 0,
    other: 0,
  };
  const perSessionGroups = sessions.map((s) => {
    const g = sessionMethodGroups(s);
    groupTotals.cash += g.cash;
    groupTotals.card += g.card;
    groupTotals.transfer += g.transfer;
    groupTotals.other += g.other;
    return { session: s, groups: g };
  });
  const salesTotal = r2(
    groupTotals.cash + groupTotals.card + groupTotals.transfer + groupTotals.other,
  );

  const sessionRow = (s: CashRegisterSession, g: Record<PaymentGroup, number>) => ({
    number: s.sessionNumber,
    cashier: s.cashierName,
    status: s.status === "open" ? "Abierta" : "Cerrada",
    openedAt: toExcelDate(s.openedAt),
    closedAt: s.closedAt ? toExcelDate(s.closedAt) : null,
    opening: s.openingAmount,
    sales: r2(g.cash + g.card + g.transfer + g.other),
    cash: r2(g.cash),
    card: r2(g.card),
    transfer: r2(g.transfer),
    other: r2(g.other),
    expected: s.expectedCash,
    counted: s.countedCash ?? null,
    difference: s.difference ?? null,
  });

  const SESSION_COLUMNS = [
    { header: "Sesión", key: "number", width: 20 },
    { header: "Cajero", key: "cashier", width: 22 },
    { header: "Estado", key: "status", width: 10 },
    { header: "Apertura", key: "openedAt", format: "datetime" as const },
    { header: "Cierre", key: "closedAt", format: "datetime" as const },
    { header: "Base inicial", key: "opening", format: "currency" as const },
    { header: "Ventas totales", key: "sales", format: "currency" as const },
    { header: "Efectivo", key: "cash", format: "currency" as const },
    { header: "Tarjeta", key: "card", format: "currency" as const },
    { header: "Transferencia", key: "transfer", format: "currency" as const },
    { header: "Otros", key: "other", format: "currency" as const },
    { header: "Efectivo esperado", key: "expected", format: "currency" as const },
    { header: "Efectivo contado", key: "counted", format: "currency" as const },
    { header: "Diferencia", key: "difference", format: "currency" as const },
  ];

  const resumen: SheetSpec = {
    name: "Resumen",
    kpis: [
      { label: "Sesiones", value: sessions.length, format: "int" },
      { label: "Base inicial acumulada", value: openingTotal, format: "currency" },
      { label: "Ventas totales", value: salesTotal, format: "currency" },
      { label: "Efectivo", value: r2(groupTotals.cash), format: "currency" },
      { label: "Tarjeta", value: r2(groupTotals.card), format: "currency" },
      { label: "Transferencia", value: r2(groupTotals.transfer), format: "currency" },
      { label: "Otros", value: r2(groupTotals.other), format: "currency" },
      { label: "Efectivo esperado", value: expectedTotal, format: "currency" },
      { label: "Efectivo contado", value: countedTotal, format: "currency" },
      { label: "Diferencia acumulada", value: differenceTotal, format: "currency" },
      { label: "Sesiones con diferencia", value: withDiff.length, format: "int" },
    ],
    tables: [
      {
        title: "Ventas por método",
        columns: [
          { header: "Método", key: "label", width: 18 },
          { header: "Monto", key: "amount", format: "currency" },
          { header: "Porcentaje", key: "pct", format: "percent" },
        ],
        rows: (Object.keys(groupTotals) as PaymentGroup[]).map((k) => ({
          label: PAYMENT_GROUP_LABEL[k],
          amount: r2(groupTotals[k]),
          pct: salesTotal > 0 ? groupTotals[k] / salesTotal : 0,
        })),
        totals: {
          label: "TOTAL",
          amount: salesTotal,
          pct: salesTotal > 0 ? 1 : 0,
        },
      },
    ],
  };

  const sesiones: SheetSpec = {
    name: "Sesiones",
    tables: [
      {
        columns: SESSION_COLUMNS,
        rows: perSessionGroups.map(({ session, groups }) =>
          sessionRow(session, groups),
        ),
        totals: {
          number: "TOTAL",
          opening: openingTotal,
          sales: salesTotal,
          cash: r2(groupTotals.cash),
          card: r2(groupTotals.card),
          transfer: r2(groupTotals.transfer),
          other: r2(groupTotals.other),
          expected: expectedTotal,
          counted: countedTotal,
          difference: differenceTotal,
        },
      },
    ],
  };

  const diferencias: SheetSpec = {
    name: "Diferencias",
    tables: [
      {
        columns: SESSION_COLUMNS,
        rows: perSessionGroups
          .filter(({ session }) => session.difference != null && session.difference !== 0)
          .map(({ session, groups }) => sessionRow(session, groups)),
      },
    ],
  };

  return { meta, sheets: [resumen, sesiones, diferencias] };
}
