"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { BarChart } from "@/components/ui/bar-chart";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import {
  ReportLayout,
  ReportHeader,
  ReportSummaryCards,
  ReportSection,
  ReportFooter,
  ReportEmptyState,
  PrintReportButton,
  type ReportKpi,
} from "@/components/reporting/report-layout";
import { useCustomers } from "@/features/customers/customer-store";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency, formatDateTime, relativeTime } from "@/lib/utils/format";

export default function ReporteClientesPage() {
  const customers = useCustomers();

  const [generatedAt, setGeneratedAt] = React.useState("");
  React.useEffect(() => {
    setGeneratedAt(formatDateTime(new Date().toISOString()));
  }, []);

  const totalSpent = customers.reduce((s, c) => s + c.totalSpent, 0);
  const totalOrders = customers.reduce((s, c) => s + c.totalOrders, 0);
  const avgTicket = totalOrders > 0 ? totalSpent / totalOrders : 0;
  const vip = customers.filter((c) => c.tags?.includes("VIP")).length;

  const segmentation = React.useMemo(() => {
    const tagCount: Record<string, number> = {};
    customers.forEach((c) =>
      (c.tags ?? []).forEach((t) => (tagCount[t] = (tagCount[t] ?? 0) + 1)),
    );
    return Object.entries(tagCount)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [customers]);

  const ranked = React.useMemo(
    () => [...customers].sort((a, b) => b.totalSpent - a.totalSpent),
    [customers],
  );
  const pag = usePagination(ranked);

  const kpiItems: ReportKpi[] = [
    { label: "Clientes activos", value: customers.length, tone: "primary" },
    { label: "Total gastado acumulado", value: formatCurrency(totalSpent) },
    { label: "Ticket promedio", value: formatCurrency(avgTicket) },
    { label: "Clientes VIP", value: vip },
  ];

  return (
    <>
      <PageHeader
        title="Reporte de clientes"
        description="Frecuentes, segmentación, total gastado y ticket promedio."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Clientes" }]}
        actions={<PrintReportButton />}
      />

      <ReportLayout>
        <ReportHeader
          businessName="DermaLand"
          title="Reporte de clientes"
          subtitle="Clientes frecuentes, segmentación, total gastado y ticket promedio."
          generatedBy={mockCurrentUser.fullName}
          generatedAt={generatedAt}
        />

        <ReportSummaryCards items={kpiItems} columns={4} />

        {segmentation.length > 0 && (
          <ReportSection title="Segmentación por etiqueta">
            <BarChart data={segmentation} />
          </ReportSection>
        )}

        {/* Top (pantalla) */}
        <div className="screen-only">
          <ReportSection title="Clientes por gasto" flush>
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH className="text-right">Compras</TH>
                  <TH className="text-right">Total gastado</TH>
                  <TH>Última visita</TH>
                </TR>
              </THead>
              <TBody>
                {ranked.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="py-10 text-center text-sm opacity-60">
                      No hay clientes para mostrar.
                    </TD>
                  </TR>
                )}
                {pag.pageItems.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <div className="text-sm font-medium">
                        {c.firstName} {c.lastName}
                      </div>
                      <div className="font-mono text-xs opacity-60">{c.customerNumber}</div>
                    </TD>
                    <TD className="text-right tabular-nums">{c.totalOrders}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {formatCurrency(c.totalSpent)}
                    </TD>
                    <TD className="text-xs opacity-70">
                      {c.lastVisitAt ? relativeTime(c.lastVisitAt) : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {ranked.length > 0 && (
              <DataPagination
                page={pag.page}
                pageSize={pag.pageSize}
                total={pag.total}
                onPageChange={pag.setPage}
                onPageSizeChange={pag.setPageSize}
              />
            )}
          </ReportSection>
        </div>

        {/* Completo (impresión) */}
        <div className="print-only">
          <ReportSection title={`Clientes por gasto (${ranked.length})`} flush>
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH className="text-right">Compras</TH>
                  <TH className="text-right">Total gastado</TH>
                </TR>
              </THead>
              <TBody>
                {ranked.map((c) => (
                  <TR key={`print-${c.id}`}>
                    <TD className="text-xs">
                      {c.firstName} {c.lastName}
                    </TD>
                    <TD className="text-right tabular-nums text-xs">{c.totalOrders}</TD>
                    <TD className="text-right tabular-nums text-xs">
                      {formatCurrency(c.totalSpent)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </ReportSection>
        </div>

        <ReportFooter
          businessName="DermaLand"
          reportName="Reporte de clientes"
          generatedAt={generatedAt}
        />
      </ReportLayout>
    </>
  );
}
