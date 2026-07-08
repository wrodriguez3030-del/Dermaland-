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
  type ReportKpi,
  type ReportBadgeTone,
} from "@/components/reporting/report-layout";
import { mockCountItems, mockInventoryCounts } from "@/lib/mock-data/inventory-counts";
import { ExportExcelButton } from "@/components/reporting/export-excel-button";
import { ExportPdfButton } from "@/components/reporting/export-pdf-button";
import { buildCountsWorkbookSpec } from "@/features/inventory/counts-report-excel";
import { buildCountsPdfSpec } from "@/features/inventory/counts-report-pdf";
import { makePdfMeta } from "@/lib/reports/pdf/meta";
import { useBranches } from "@/features/tenancy/branch-store";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatDate, formatDateTime } from "@/lib/utils/format";

const STATUS_LABEL: Record<string, string> = {
  shortage: "Faltante",
  overage: "Sobrante",
  expired: "Vencido",
  unregistered: "No registrado",
};
const STATUS_TONE: Record<string, ReportBadgeTone> = {
  shortage: "high",
  overage: "pending",
  expired: "high",
  unregistered: "medium",
};

export default function ReporteConteosPage() {
  const allBranches = useBranches();
  const [generatedAt, setGeneratedAt] = React.useState("");
  React.useEffect(() => {
    setGeneratedAt(formatDateTime(new Date().toISOString()));
  }, []);
  const branchNames = React.useMemo(
    () => new Map(allBranches.map((b) => [b.id, b.name])),
    [allBranches],
  );

  const approvedCounts = mockInventoryCounts.filter((c) => c.status === "approved").length;
  const totalShortages = mockCountItems.filter((i) => i.status === "shortage").length;
  const totalOverages = mockCountItems.filter((i) => i.status === "overage").length;
  const expiredFound = mockCountItems.filter((i) => i.status === "expired").length;

  const diffs = React.useMemo(
    () => mockCountItems.filter((i) => i.status !== "match"),
    [],
  );
  const pag = usePagination(diffs);

  const kpiItems: ReportKpi[] = [
    { label: "Inventarios aprobados", value: approvedCounts, tone: "primary" },
    { label: "Faltantes", value: totalShortages, tone: totalShortages ? "danger" : "default" },
    { label: "Sobrantes", value: totalOverages, tone: totalOverages ? "warning" : "default" },
    { label: "Vencidos detectados", value: expiredFound, tone: expiredFound ? "danger" : "default" },
  ];

  return (
    <>
      <PageHeader
        title="Reporte de inventario físico"
        description="Diferencias acumuladas, faltantes, sobrantes y lotes vencidos detectados."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Inventario físico" }]}
        actions={
          <>
            <ExportPdfButton
              getSpec={() =>
                buildCountsPdfSpec(
                  mockCountItems,
                  makePdfMeta({
                    title: "Inventario físico",
                    subtitle:
                      "Diferencias acumuladas, faltantes, sobrantes y lotes vencidos",
                    reportKind: "Inventario físico",
                    cutLabel: `Fecha de corte: ${formatDate(new Date().toISOString())}`,
                    periodLabel: "Historial de conteos",
                    branchLabel: "Todas las sucursales",
                    filtersLabel: "Sin filtros adicionales",
                    generatedBy: mockCurrentUser.fullName,
                    generatedAtLabel: formatDateTime(new Date().toISOString()),
                  }),
                )
              }
              fileSlug="Inventario_Fisico"
            />
            <ExportExcelButton
              getSpec={() =>
                buildCountsWorkbookSpec(
                  mockInventoryCounts,
                  mockCountItems,
                  {
                    title: "Reporte de inventario físico",
                    subtitle:
                      "Diferencias acumuladas, faltantes, sobrantes y lotes vencidos detectados.",
                    rangeLabel: "Historial de conteos",
                    branchLabel: "Todas las sucursales",
                    filtersLabel: "Sin filtros adicionales",
                    generatedBy: mockCurrentUser.fullName,
                    generatedAtLabel: formatDateTime(new Date().toISOString()),
                  },
                  (id) => branchNames.get(id) ?? "Sucursal",
                )
              }
              fileSlug="Inventario_Fisico"
            />
          </>
        }
      />

      <ReportLayout>
        <ReportHeader
          businessName="DermaLand"
          title="Reporte de inventario físico"
          subtitle="Diferencias acumuladas, faltantes, sobrantes y lotes vencidos detectados."
          generatedBy={mockCurrentUser.fullName}
          generatedAt={generatedAt}
        />

        <ReportSummaryCards items={kpiItems} columns={4} />

        <ReportSection title="Diferencias detectadas" tone="warning" flush>
          {diffs.length === 0 ? (
            <ReportEmptyState message="Sin diferencias en los inventarios." />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Producto</TH>
                    <TH>Lote</TH>
                    <TH className="text-right">Esperado</TH>
                    <TH className="text-right">Contado</TH>
                    <TH className="text-right">Diferencia</TH>
                    <TH>Estado</TH>
                  </TR>
                </THead>
                <TBody>
                  {pag.pageItems.map((it) => (
                    <TR key={it.id}>
                      <TD>
                        <div className="text-sm">{it.productName}</div>
                        <div className="font-mono text-xs opacity-60">{it.productSku}</div>
                      </TD>
                      <TD className="font-mono text-xs">{it.lotNumber}</TD>
                      <TD className="text-right tabular-nums">{it.expectedQuantity}</TD>
                      <TD className="text-right tabular-nums">{it.countedQuantity}</TD>
                      <TD
                        className={`text-right tabular-nums font-medium ${
                          it.differenceQuantity < 0 ? "text-rose-700" : "text-amber-700"
                        }`}
                      >
                        {it.differenceQuantity > 0 ? "+" : ""}
                        {it.differenceQuantity}
                      </TD>
                      <TD>
                        <ReportBadge tone={STATUS_TONE[it.status] ?? "neutral"}>
                          {STATUS_LABEL[it.status] ?? it.status}
                        </ReportBadge>
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
          reportName="Reporte de inventario físico"
          generatedAt={generatedAt}
        />
      </ReportLayout>
    </>
  );
}
