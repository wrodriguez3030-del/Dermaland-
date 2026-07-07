"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import {
  ReportLayout,
  ReportHeader,
  ReportSummaryCards,
  ReportSection,
  ReportFooter,
  ReportEmptyState,
  ReportBadge,
  PrintReportButton,
  type ReportKpi,
} from "@/components/reporting/report-layout";
import { useCashSessionHistory } from "@/features/sales/cash-session-store";
import { ExportExcelButton } from "@/components/reporting/export-excel-button";
import { buildCashWorkbookSpec } from "@/features/sales/cash-report-excel";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

export default function ReporteCajaPage() {
  const { sessions, loading } = useCashSessionHistory();

  const [generatedAt, setGeneratedAt] = React.useState("");
  React.useEffect(() => {
    setGeneratedAt(formatDateTime(new Date().toISOString()));
  }, []);

  const totalExpected = sessions.reduce((s, x) => s + x.expectedCash, 0);
  const totalDifference = sessions
    .filter((x) => x.difference != null)
    .reduce((s, x) => s + (x.difference ?? 0), 0);
  const withDiff = sessions.filter(
    (s) => s.difference != null && s.difference !== 0,
  ).length;

  const ordered = React.useMemo(
    () => [...sessions].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)),
    [sessions],
  );
  const pag = usePagination(ordered);

  const kpiItems: ReportKpi[] = [
    { label: "Sesiones", value: sessions.length, tone: "primary" },
    { label: "Efectivo esperado", value: formatCurrency(totalExpected) },
    {
      label: "Diferencia acumulada",
      value: formatCurrency(totalDifference),
      tone: totalDifference < 0 ? "danger" : totalDifference > 0 ? "warning" : "default",
    },
    { label: "Sesiones con diferencia", value: withDiff, tone: withDiff ? "warning" : "default" },
  ];

  return (
    <>
      <PageHeader
        title="Reporte de caja"
        description="Aperturas, cierres y diferencias por sesión y cajero."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Caja" }]}
        actions={
          <>
            <ExportExcelButton
              getSpec={() =>
                buildCashWorkbookSpec(ordered, {
                  title: "Reporte de caja",
                  subtitle: "Aperturas, cierres y diferencias por sesión y cajero.",
                  rangeLabel: "Historial de sesiones",
                  branchLabel: "Todas las sucursales",
                  filtersLabel: "Sin filtros adicionales",
                  generatedBy: mockCurrentUser.fullName,
                  generatedAtLabel: formatDateTime(new Date().toISOString()),
                })
              }
              fileSlug="Reporte_Caja"
            />
            <PrintReportButton />
          </>
        }
      />

      <ReportLayout>
        <ReportHeader
          businessName="DermaLand"
          title="Reporte de caja"
          subtitle="Aperturas, cierres y diferencias por sesión y cajero."
          generatedBy={mockCurrentUser.fullName}
          generatedAt={generatedAt}
        />

        <ReportSummaryCards items={kpiItems} columns={4} />

        <ReportSection title="Detalle por sesión" flush>
          {loading && sessions.length === 0 ? (
            <ReportEmptyState message="Cargando sesiones…" />
          ) : ordered.length === 0 ? (
            <ReportEmptyState message="Sin sesiones de caja registradas." />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Sesión</TH>
                    <TH>Cajero</TH>
                    <TH>Estado</TH>
                    <TH>Apertura</TH>
                    <TH className="text-right">Esperado</TH>
                    <TH className="text-right">Contado</TH>
                    <TH className="text-right">Diferencia</TH>
                  </TR>
                </THead>
                <TBody>
                  {pag.pageItems.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-mono text-xs">{s.sessionNumber}</TD>
                      <TD className="text-sm">{s.cashierName}</TD>
                      <TD>
                        <ReportBadge tone={s.status === "open" ? "pending" : "success"}>
                          {s.status === "open" ? "Abierta" : "Cerrada"}
                        </ReportBadge>
                      </TD>
                      <TD className="text-xs">{formatDateTime(s.openedAt)}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(s.expectedCash)}</TD>
                      <TD className="text-right tabular-nums">
                        {s.countedCash != null ? formatCurrency(s.countedCash) : "—"}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {s.difference != null ? formatCurrency(s.difference) : "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <DataPagination
                page={pag.page}
                pageSize={pag.pageSize}
                total={pag.total}
                onPageChange={pag.setPage}
                onPageSizeChange={pag.setPageSize}
              />
            </>
          )}
        </ReportSection>

        <ReportFooter
          businessName="DermaLand"
          reportName="Reporte de caja"
          generatedAt={generatedAt}
        />
      </ReportLayout>
    </>
  );
}
