"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, Mail, MessageSquare, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  Skeleton,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { BarChart } from "@/components/ui/bar-chart";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import {
  ReportLayout,
  ReportHeader,
  ReportSummaryCards,
  ReportSection,
  ReportFooter,
  type ReportKpi,
} from "@/components/reporting/report-layout";
import { useCustomersReport } from "@/features/customers/customer-profile-hooks";
import {
  computeCustomersReportKpis,
  isVipCustomer,
  type CustomerMetricsRow,
} from "@/features/customers/customer-metrics";
import { normalizePhone } from "@/features/customers/customer-normalization";
import { skinTypeOptions, skinTypeLabel } from "@/features/customers/billing";
import { useActiveBranches } from "@/features/tenancy/branch-store";
import { ExportExcelButton } from "@/components/reporting/export-excel-button";
import { ExportPdfButton } from "@/components/reporting/export-pdf-button";
import { buildCustomersWorkbookSpec } from "@/features/customers/customers-report-excel";
import { buildCustomersPdfSpec } from "@/features/customers/customers-report-pdf";
import { makePdfMeta } from "@/lib/reports/pdf/meta";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency, formatDateTime, relativeTime } from "@/lib/utils/format";

/**
 * Reporte de Clientes — usa la MISMA capa de métricas que el perfil del
 * cliente (`computeCustomerPurchaseStats` vía `useCustomersReport`), por lo
 * que Total gastado / Compras / Última visita coinciden EXACTAMENTE con lo
 * que muestra el perfil bajo los mismos filtros. Los KPIs y la tabla usan
 * el mismo conjunto filtrado (nunca filtros distintos entre sí).
 */

interface ReportFilters {
  from?: string;
  to?: string;
  branchId?: string;
  search?: string;
  skinType?: string;
  segment?: string;
  minPurchases?: string;
  minSpent?: string;
}

export default function ReporteClientesPage() {
  const [filters, setFilters] = React.useState<ReportFilters>({});
  const set = (key: keyof ReportFilters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value || undefined }));

  // Métricas por cliente — servidor en modo supabase, stores en modo local.
  const { rows, loading, error, retry } = useCustomersReport({
    from: filters.from,
    to: filters.to,
    branchId: filters.branchId,
  });
  const activeBranches = useActiveBranches();

  const [generatedAt, setGeneratedAt] = React.useState("");
  React.useEffect(() => {
    setGeneratedAt(formatDateTime(new Date().toISOString()));
  }, []);

  // Filtros locales sobre las filas agregadas (cliente/piel/segmento/mínimos).
  const filtered = React.useMemo(() => {
    const term = (filters.search ?? "").trim().toLowerCase();
    const minPurchases = Number(filters.minPurchases ?? 0) || 0;
    const minSpent = Number(filters.minSpent ?? 0) || 0;
    return rows.filter(({ customer: c, stats }) => {
      if (term) {
        const hay = `${c.firstName} ${c.lastName} ${c.customerNumber} ${c.documentNumber ?? ""} ${c.phone ?? ""}`
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (filters.skinType && c.skinType !== filters.skinType) return false;
      if (filters.segment === "vip" && !isVipCustomer(c, stats)) return false;
      if (
        filters.segment &&
        filters.segment !== "vip" &&
        !(c.tags ?? []).includes(filters.segment)
      )
        return false;
      if (stats.purchases < minPurchases) return false;
      if (stats.totalSpent < minSpent) return false;
      return true;
    });
  }, [rows, filters.search, filters.skinType, filters.segment, filters.minPurchases, filters.minSpent]);

  const kpis = React.useMemo(
    () => computeCustomersReportKpis(filtered),
    [filtered],
  );

  const segmentation = React.useMemo(() => {
    const tagCount: Record<string, number> = {};
    filtered.forEach(({ customer: c }) =>
      (c.tags ?? []).forEach((t) => (tagCount[t] = (tagCount[t] ?? 0) + 1)),
    );
    return Object.entries(tagCount)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const segmentOptions = React.useMemo(() => {
    const tags = new Set<string>();
    rows.forEach(({ customer: c }) => (c.tags ?? []).forEach((t) => tags.add(t)));
    return [...tags].sort();
  }, [rows]);

  const ranked = React.useMemo(
    () => [...filtered].sort((a, b) => b.stats.totalSpent - a.stats.totalSpent),
    [filtered],
  );
  const pag = usePagination(ranked);

  const kpiItems: ReportKpi[] = [
    { label: "Clientes activos", value: kpis.activeCustomers, tone: "primary" },
    { label: "Total gastado acumulado", value: formatCurrency(kpis.totalSpent) },
    { label: "Ticket promedio", value: formatCurrency(kpis.avgTicket) },
    { label: "Clientes VIP", value: kpis.vipCustomers },
  ];

  const clearFilters = () => setFilters({});

  // Metadata compartida (filtros/rango/sucursal) para Excel y PDF.
  const rangeLabel =
    filters.from || filters.to
      ? `${filters.from || "inicio"} a ${filters.to || "hoy"}`
      : "Todo";
  const branchLabel = filters.branchId
    ? activeBranches.find((b) => b.id === filters.branchId)?.name ?? "Sucursal"
    : "Todas las sucursales";
  const filtersLabel = (() => {
    const parts: string[] = [];
    if (filters.search) parts.push(`Cliente: ${filters.search}`);
    if (filters.skinType)
      parts.push(`Tipo de piel: ${skinTypeLabel(filters.skinType as never)}`);
    if (filters.segment) parts.push(`Segmento: ${filters.segment}`);
    if (filters.minPurchases) parts.push(`Compras mínimas: ${filters.minPurchases}`);
    if (filters.minSpent) parts.push(`Gasto mínimo: RD$${filters.minSpent}`);
    return parts.length ? parts.join(" · ") : "Sin filtros adicionales";
  })();

  // Excel profesional: mismas filas FILTRADAS y misma capa de métricas
  // (customer-metrics) que esta pantalla y el perfil del cliente.
  const excelSpec = () =>
    buildCustomersWorkbookSpec(filtered, {
      title: "Reporte de clientes",
      subtitle: "Frecuentes, segmentación, total gastado y ticket promedio.",
      rangeLabel,
      branchLabel,
      filtersLabel,
      generatedBy: mockCurrentUser.fullName,
      generatedAtLabel: formatDateTime(new Date().toISOString()),
    });

  const pdfSpec = () =>
    buildCustomersPdfSpec(
      filtered,
      makePdfMeta({
        title: "Reporte de clientes",
        subtitle: "Frecuentes, segmentación, total gastado y ticket promedio",
        reportKind: "Reporte de clientes",
        cutLabel: `Fecha de corte: ${formatDateTime(new Date().toISOString())}`,
        periodLabel: rangeLabel,
        branchLabel,
        filtersLabel,
        generatedBy: mockCurrentUser.fullName,
        generatedAtLabel: formatDateTime(new Date().toISOString()),
      }),
    );

  return (
    <>
      <PageHeader
        title="Reporte de clientes"
        description="Frecuentes, segmentación, total gastado y ticket promedio — mismas métricas que el perfil."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Clientes" }]}
        actions={
          <>
            <ExportPdfButton getSpec={pdfSpec} fileSlug="Reporte_Clientes" />
            <ExportExcelButton getSpec={excelSpec} fileSlug="Reporte_Clientes" />
          </>
        }
      />

      {/* Filtros — KPIs y tabla usan exactamente este mismo conjunto. */}
      <Card className="screen-only mb-6">
        <CardContent className="py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Desde</Label>
              <Input
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => set("from", e.target.value)}
              />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => set("to", e.target.value)}
              />
            </div>
            <div>
              <Label>Sucursal</Label>
              <Select
                value={filters.branchId ?? ""}
                onChange={(e) => set("branchId", e.target.value)}
              >
                <option value="">Todas las sucursales</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Cliente</Label>
              <Input
                placeholder="Nombre, código, documento…"
                value={filters.search ?? ""}
                onChange={(e) => set("search", e.target.value)}
              />
            </div>
            <div>
              <Label>Tipo de piel</Label>
              <Select
                value={filters.skinType ?? ""}
                onChange={(e) => set("skinType", e.target.value)}
              >
                <option value="">Todos</option>
                {skinTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Segmento</Label>
              <Select
                value={filters.segment ?? ""}
                onChange={(e) => set("segment", e.target.value)}
              >
                <option value="">Todos</option>
                <option value="vip">VIP</option>
                {segmentOptions
                  .filter((t) => t !== "VIP")
                  .map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label>Compras mínimas</Label>
              <Input
                type="number"
                min={0}
                value={filters.minPurchases ?? ""}
                onChange={(e) => set("minPurchases", e.target.value)}
              />
            </div>
            <div>
              <Label>Gasto mínimo (RD$)</Label>
              <Input
                type="number"
                min={0}
                value={filters.minSpent ?? ""}
                onChange={(e) => set("minSpent", e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6">
          <CardContent className="py-8 text-center">
            <p className="text-sm opacity-70">{error}</p>
            <Button size="sm" className="mt-3" onClick={retry}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && !error && (
        <div data-testid="reporte-clientes-skeleton" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="py-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-3 h-6 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="py-5 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && !error && (
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
                    <TH className="text-right">Ticket promedio</TH>
                    <TH>Última visita</TH>
                    <TH>Segmento</TH>
                    <TH className="text-right pr-4">Acciones</TH>
                  </TR>
                </THead>
                <TBody>
                  {ranked.length === 0 && (
                    <TR>
                      <TD colSpan={7} className="py-10 text-center text-sm opacity-60">
                        No hay clientes para mostrar con estos filtros.
                      </TD>
                    </TR>
                  )}
                  {pag.pageItems.map((row) => (
                    <ReportRow key={row.customer.id} row={row} />
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
                    <TH className="text-right">Ticket promedio</TH>
                  </TR>
                </THead>
                <TBody>
                  {ranked.map(({ customer: c, stats }) => (
                    <TR key={`print-${c.id}`}>
                      <TD className="text-xs">
                        {c.firstName} {c.lastName}
                      </TD>
                      <TD className="text-right tabular-nums text-xs">
                        {stats.purchases}
                      </TD>
                      <TD className="text-right tabular-nums text-xs">
                        {formatCurrency(stats.totalSpent)}
                      </TD>
                      <TD className="text-right tabular-nums text-xs">
                        {formatCurrency(stats.avgTicket)}
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
      )}
    </>
  );
}

function ReportRow({ row }: { row: CustomerMetricsRow }) {
  const { customer: c, stats } = row;
  const vip = isVipCustomer(c, stats);
  const waPhone = normalizePhone(c.whatsapp ?? c.phone);
  return (
    <TR>
      <TD>
        <div className="text-sm font-medium">
          {c.firstName} {c.lastName}
        </div>
        <div className="font-mono text-xs opacity-60">{c.customerNumber}</div>
      </TD>
      <TD className="text-right tabular-nums">{stats.purchases}</TD>
      <TD className="text-right tabular-nums font-medium">
        {formatCurrency(stats.totalSpent)}
      </TD>
      <TD className="text-right tabular-nums">
        {formatCurrency(stats.avgTicket)}
      </TD>
      <TD className="text-xs opacity-70">
        {stats.lastVisitAt ? relativeTime(stats.lastVisitAt) : "—"}
      </TD>
      <TD>
        <div className="flex flex-wrap items-center gap-1">
          {vip && <Badge tone="warning">VIP</Badge>}
          <span className="text-xs opacity-60">{skinTypeLabel(c.skinType)}</span>
        </div>
      </TD>
      <TD className="pr-4">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/clientes/${c.id}`}
            title="Ver cliente"
            className="opacity-60 hover:opacity-100"
          >
            <Eye className="h-4 w-4" />
          </Link>
          {waPhone && (
            <a
              href={`https://wa.me/1${waPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp"
              className="opacity-60 hover:opacity-100"
            >
              <MessageSquare className="h-4 w-4" />
            </a>
          )}
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              title="Enviar correo"
              className="opacity-60 hover:opacity-100"
            >
              <Mail className="h-4 w-4" />
            </a>
          )}
          <Link
            href={`/clientes/${c.id}#compras`}
            title="Ver compras"
            className="opacity-60 hover:opacity-100"
          >
            <ShoppingCart className="h-4 w-4" />
          </Link>
        </div>
      </TD>
    </TR>
  );
}
