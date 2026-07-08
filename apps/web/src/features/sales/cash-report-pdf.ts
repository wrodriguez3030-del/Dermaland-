// Spec PURO del PDF profesional del Reporte de Caja.
//
// Reutiliza `sessionMethodGroups` (misma agregación que el Excel y la pantalla).

import type { ReportPdfMeta, ReportPdfSpec, PdfSection } from "@/lib/reports/pdf/types";
import type { CashRegisterSession } from "@/types";
import { PAYMENT_GROUP_LABEL, type PaymentGroup } from "./sales-report";
import { sessionMethodGroups } from "./cash-report-excel";

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function buildCashPdfSpec(
  sessions: CashRegisterSession[],
  meta: ReportPdfMeta,
): ReportPdfSpec {
  const openingTotal = r2(sessions.reduce((s, x) => s + x.openingAmount, 0));
  const expectedTotal = r2(sessions.reduce((s, x) => s + x.expectedCash, 0));
  const countedTotal = r2(sessions.reduce((s, x) => s + (x.countedCash ?? 0), 0));
  const differenceTotal = r2(
    sessions.filter((x) => x.difference != null).reduce((s, x) => s + (x.difference ?? 0), 0),
  );

  const groupTotals: Record<PaymentGroup, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
  const perSession = sessions.map((s) => {
    const g = sessionMethodGroups(s);
    groupTotals.cash += g.cash;
    groupTotals.card += g.card;
    groupTotals.transfer += g.transfer;
    groupTotals.other += g.other;
    return { s, g };
  });
  const salesTotal = r2(
    groupTotals.cash + groupTotals.card + groupTotals.transfer + groupTotals.other,
  );

  const porMetodo: PdfSection = {
    title: "Ventas por método",
    table: {
      columns: [
        { header: "Método", key: "label", weight: 1.4 },
        { header: "Monto", key: "amount", format: "currency" },
        { header: "% del total", key: "pct", format: "percent" },
      ],
      rows: (Object.keys(groupTotals) as PaymentGroup[]).map((key) => ({
        label: PAYMENT_GROUP_LABEL[key],
        amount: r2(groupTotals[key]),
        pct: salesTotal > 0 ? groupTotals[key] / salesTotal : 0,
      })),
      totals: { label: "TOTAL", amount: salesTotal, pct: salesTotal > 0 ? 1 : 0 },
    },
  };

  const sesiones: PdfSection = {
    title: "Sesiones de caja",
    table: {
      columns: [
        { header: "Sesión", key: "number", weight: 1.2 },
        { header: "Cajero", key: "cashier", weight: 1.4 },
        { header: "Estado", key: "status", weight: 0.8 },
        { header: "Apertura", key: "opened", format: "datetime" },
        { header: "Esperado", key: "expected", format: "currency" },
        { header: "Contado", key: "counted", format: "currency" },
        { header: "Diferencia", key: "difference", format: "currency" },
      ],
      rows: perSession.map(({ s }) => ({
        number: s.sessionNumber,
        cashier: s.cashierName,
        status: s.status === "open" ? "Abierta" : "Cerrada",
        opened: s.openedAt,
        expected: s.expectedCash,
        counted: s.countedCash ?? null,
        difference: s.difference ?? null,
      })),
      totals: {
        number: "TOTAL",
        expected: expectedTotal,
        counted: countedTotal,
        difference: differenceTotal,
      },
      emptyMessage: "Sin sesiones de caja registradas.",
    },
  };

  return {
    meta,
    orientation: "landscape",
    kpis: [
      { label: "Sesiones", value: sessions.length, format: "int" },
      { label: "Ventas totales", value: salesTotal, format: "currency" },
      { label: "Efectivo", value: r2(groupTotals.cash), format: "currency" },
      { label: "Tarjeta", value: r2(groupTotals.card), format: "currency" },
      { label: "Transferencia", value: r2(groupTotals.transfer), format: "currency" },
      { label: "Base inicial", value: openingTotal, format: "currency" },
      { label: "Efectivo contado", value: countedTotal, format: "currency" },
      {
        label: "Diferencia",
        value: differenceTotal,
        format: "currency",
        tone: differenceTotal < 0 ? "bad" : differenceTotal > 0 ? "warn" : "good",
      },
    ],
    sections: [porMetodo, sesiones],
  };
}
