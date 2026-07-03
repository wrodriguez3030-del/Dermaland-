"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Modal,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { BarChart } from "@/components/ui/bar-chart";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { RowActions } from "@/components/ui/row-actions";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import {
  ReportLayout,
  ReportHeader,
  ReportSummaryCards,
  ReportFiltersSummary,
  ReportFooter,
  PrintReportButton,
  type ReportKpi,
  type ReportFilterChip,
} from "@/components/reporting/report-layout";
import { useToast } from "@/components/ui/toast";
import {
  Boxes,
  Eye,
  Pencil,
  Printer,
  Send,
  FileDown,
  Ban,
  CreditCard,
  Plus,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { useProformas, cancelProformaAnywhere } from "@/features/sales/proforma-store";
import { useBranches, useActiveBranches } from "@/features/tenancy/branch-store";
import { useProducts } from "@/features/products/product-store";
import { shareProformaWhatsapp } from "@/features/sales/whatsapp-share.client";
import {
  documentRouteBase,
  isInvoiceDocument,
  saleDocumentTone,
} from "@/features/sales/document-label";
import { documentEditability } from "@/features/sales/editability";
import { canEditSales } from "@/features/billing/permissions";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";
import { downloadBlob } from "@/lib/utils/download";
import type { Proforma } from "@/types";
import {
  EMPTY_FILTERS,
  buildSalesReport,
  comprobanteLabel,
  paymentMethodGroup,
  quickRange,
  saleMethodSummary,
  saleStatusKey,
  COMPROBANTE_LABEL,
  SALE_METHOD_LABEL,
  SALE_STATUS_LABEL,
  SALE_STATUS_TONE,
  PAYMENT_GROUP_LABEL,
  type ComprobanteKey,
  type QuickRangeKey,
  type SaleMethodSummary,
  type SaleStatusKey,
  type SalesReportFilters,
} from "@/features/sales/sales-report";
// El módulo de exportación arrastra xlsx (~100 kB gz): se carga on-demand al exportar.
import type { SalesReportMeta } from "@/features/sales/sales-report-export";

// ─── Ordenamiento (comparadores sobre el documento de venta) ─────────────────

const COMPARATORS = {
  date: (a: Proforma, b: Proforma) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  total: (a: Proforma, b: Proforma) => a.total - b.total,
  customer: (a: Proforma, b: Proforma) =>
    (a.customerName || "").localeCompare(b.customerName || "", "es"),
  cashier: (a: Proforma, b: Proforma) =>
    (a.cashierName || "").localeCompare(b.cashierName || "", "es"),
  method: (a: Proforma, b: Proforma) =>
    saleMethodSummary(a).localeCompare(saleMethodSummary(b)),
  status: (a: Proforma, b: Proforma) =>
    saleStatusKey(a.status).localeCompare(saleStatusKey(b.status)),
  documentType: (a: Proforma, b: Proforma) =>
    comprobanteLabel(a).localeCompare(comprobanteLabel(b), "es"),
} as const;

const QUICK_RANGES: { key: QuickRangeKey; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "last7", label: "Últimos 7 días" },
  { key: "thisMonth", label: "Este mes" },
  { key: "lastMonth", label: "Mes anterior" },
  { key: "all", label: "Todo" },
];

const COMPROBANTE_OPTIONS: ComprobanteKey[] = [
  "proforma",
  "b02",
  "b01",
  "e32",
  "e31",
  "nota_credito",
  "nota_debito",
];

const METHOD_OPTIONS: SaleMethodSummary[] = [
  "cash",
  "card",
  "transfer",
  "other",
  "mixed",
];

const STATUS_OPTIONS: SaleStatusKey[] = [
  "paid",
  "pending",
  "cancelled",
  "returned",
  "partial",
];

export default function ReporteVentasPage() {
  const toast = useToast();
  const all = useProformas();
  const branches = useBranches();
  const activeBranches = useActiveBranches();
  const products = useProducts();

  const [filters, setFilters] = React.useState<SalesReportFilters>(EMPTY_FILTERS);
  const [paymentsFor, setPaymentsFor] = React.useState<Proforma | null>(null);
  const canEdit = canEditSales(mockCurrentUser.role);

  const branchNames = React.useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );
  const costByProductId = React.useMemo(
    () => new Map(products.map((p) => [p.id, p.cost])),
    [products],
  );

  // Cajeros que tienen ventas (para el filtro), tomados de los documentos.
  const cashierOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of all) {
      if (p.cashierId) map.set(p.cashierId, p.cashierName || "Cajero");
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [all]);

  const report = React.useMemo(
    () => buildSalesReport(all, filters, { branchNames, costByProductId }),
    [all, filters, branchNames, costByProductId],
  );

  const { sort, sorted, toggle } = useTableSort(
    report.filtered,
    "date",
    "desc",
    COMPARATORS,
  );

  // Paginación de la tabla de detalle (no afecta KPIs ni exportación, que usan
  // SIEMPRE el total de resultados filtrados).
  const pag = usePagination(sorted, { resetKey: JSON.stringify(filters) });

  const set = <K extends keyof SalesReportFilters>(
    key: K,
    value: SalesReportFilters[K],
  ) => setFilters((f) => ({ ...f, [key]: value }));

  const applyQuick = (key: QuickRangeKey) => {
    const { from, to } = quickRange(key);
    setFilters((f) => ({ ...f, from, to }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  // ── Exportación ──
  const reportMeta = (): SalesReportMeta => {
    const branchLabel = filters.branchId
      ? branchNames.get(filters.branchId) ?? "Sucursal"
      : "Todas las sucursales";
    const rangeLabel =
      filters.from || filters.to
        ? `${filters.from || "inicio"} a ${filters.to || "hoy"}`
        : "Todo";
    const parts: string[] = [];
    if (filters.method) parts.push(`Método: ${SALE_METHOD_LABEL[filters.method]}`);
    if (filters.comprobante)
      parts.push(`Comprobante: ${COMPROBANTE_LABEL[filters.comprobante]}`);
    if (filters.status) parts.push(`Estado: ${SALE_STATUS_LABEL[filters.status]}`);
    if (filters.cashierId) {
      const name = cashierOptions.find((c) => c[0] === filters.cashierId)?.[1];
      if (name) parts.push(`Cajero: ${name}`);
    }
    if (filters.customerQuery) parts.push(`Cliente: ${filters.customerQuery}`);
    if (filters.productQuery) parts.push(`Producto: ${filters.productQuery}`);
    if (filters.includeProformas) parts.push("Incluye proformas");
    return {
      businessName: "DermaLand",
      generatedAt: new Date().toISOString(),
      rangeLabel,
      branchLabel,
      filtersLabel: parts.length ? parts.join(" · ") : "Sin filtros adicionales",
    };
  };

  const stamp = () =>
    (filters.from || "todo") + (filters.to ? `_${filters.to}` : "");

  const exportExcel = async () => {
    try {
      const { salesReportXlsxBytes, salesReportFilename } = await import(
        "@/features/sales/sales-report-export"
      );
      const bytes = salesReportXlsxBytes(report, reportMeta());
      downloadBlob(
        salesReportFilename("xlsx", stamp()),
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      toast.show("Excel generado.", "success");
    } catch {
      toast.error("No se pudo generar el Excel. Intenta nuevamente.");
    }
  };

  const exportCsv = async () => {
    try {
      const { buildSalesDetailCsv, salesReportFilename } = await import(
        "@/features/sales/sales-report-export"
      );
      const csv = buildSalesDetailCsv(report);
      downloadBlob(
        salesReportFilename("csv", stamp()),
        "﻿" + csv,
        "text/csv;charset=utf-8",
      );
      toast.show("CSV generado.", "success");
    } catch {
      toast.error("No se pudo generar el CSV. Intenta nuevamente.");
    }
  };

  // ── Acciones por fila ──
  const handleShareWhatsapp = async (p: Proforma) => {
    const r = await shareProformaWhatsapp(p);
    if (r.ok) toast.show("Abriendo WhatsApp con el documento en PDF…", "info");
    else toast.error(r.error);
  };

  const handleAnular = async (p: Proforma) => {
    const r = await cancelProformaAnywhere(p.id, "Anulación desde Reportes > Ventas");
    if (r.ok) toast.show("Documento anulado.", "success");
    else toast.error(r.error ?? "No se pudo anular el documento.");
  };

  const k = report.kpis;
  const empty = report.filtered.length === 0;

  // Marca de tiempo de generación (en efecto para evitar mismatch de hidratación).
  const [generatedAt, setGeneratedAt] = React.useState("");
  React.useEffect(() => {
    setGeneratedAt(formatDateTime(new Date().toISOString()));
  }, []);

  const kpiItems: ReportKpi[] = [
    { label: "Total facturado", value: formatCurrency(k.totalBilled), tone: "primary" },
    { label: "ITBIS recaudado", value: formatCurrency(k.itbis) },
    { label: "Transacciones", value: k.transactions },
    { label: "Items vendidos", value: k.items },
    { label: "Ticket promedio", value: formatCurrency(k.avgTicket) },
    { label: "Clientes distintos", value: k.distinctCustomers },
    { label: "Descuentos", value: formatCurrency(k.discounts) },
    {
      label: "Devoluciones",
      value: formatCurrency(k.refunds),
      tone: k.refunds > 0 ? "warning" : "default",
    },
    { label: "Neto", value: formatCurrency(k.net), tone: "success" },
    {
      label: "Margen estimado",
      value: k.marginEstimate != null ? formatCurrency(k.marginEstimate) : "N/D",
      hint: k.marginEstimate == null ? "Sin costo disponible" : undefined,
    },
  ];

  const filterChips: ReportFilterChip[] = [];
  if (filters.from || filters.to)
    filterChips.push({
      label: "Fecha",
      value: `${filters.from || "inicio"} → ${filters.to || "hoy"}`,
    });
  if (filters.branchId)
    filterChips.push({
      label: "Sucursal",
      value: branchNames.get(filters.branchId) ?? "Sucursal",
    });
  if (filters.method)
    filterChips.push({ label: "Método", value: SALE_METHOD_LABEL[filters.method] });
  if (filters.comprobante)
    filterChips.push({
      label: "Comprobante",
      value: COMPROBANTE_LABEL[filters.comprobante],
    });
  if (filters.status)
    filterChips.push({ label: "Estado", value: SALE_STATUS_LABEL[filters.status] });
  if (filters.cashierId) {
    const n = cashierOptions.find((c) => c[0] === filters.cashierId)?.[1];
    if (n) filterChips.push({ label: "Cajero", value: n });
  }
  if (filters.customerQuery)
    filterChips.push({ label: "Cliente", value: filters.customerQuery });
  if (filters.productQuery)
    filterChips.push({ label: "Producto", value: filters.productQuery });
  if (filters.includeProformas)
    filterChips.push({ label: "Proformas", value: "Incluidas" });

  return (
    <>
      <PageHeader
        title="Reporte de ventas"
        description="Ventas por rango con desglose por cajero, método de pago, sucursal, producto y comprobante."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Ventas" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <PrintReportButton />
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              title="Exporta todos los resultados filtrados (no solo la página visible)."
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              title="Exporta todos los resultados filtrados (no solo la página visible)."
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
            <Link href="/pos" aria-label="Ir a POS / Nueva venta">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                POS / Nueva venta
              </Button>
            </Link>
          </div>
        }
      />

      <ReportLayout>
      <ReportHeader
        businessName="DermaLand"
        title="Reporte de ventas"
        subtitle="Ventas por rango con desglose por cajero, método de pago, sucursal, producto y comprobante."
        generatedBy={mockCurrentUser.fullName}
        generatedAt={generatedAt}
      />

      <ReportFiltersSummary filters={filterChips} />

      {/* ── Filtros (interactivos, solo pantalla) ── */}
      <Card className="mb-6 no-print">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUICK_RANGES.map((q) => (
              <Button
                key={q.key}
                size="sm"
                variant="outline"
                onClick={() => applyQuick(q.key)}
              >
                {q.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </div>

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
              <Label>Sucursal / Local</Label>
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
              <Label>Método de pago</Label>
              <Select
                value={filters.method ?? ""}
                onChange={(e) =>
                  set("method", e.target.value as SaleMethodSummary | "")
                }
              >
                <option value="">Todos</option>
                {METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {SALE_METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Tipo de comprobante</Label>
              <Select
                value={filters.comprobante ?? ""}
                onChange={(e) =>
                  set("comprobante", e.target.value as ComprobanteKey | "")
                }
              >
                <option value="">Todos</option>
                {COMPROBANTE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {COMPROBANTE_LABEL[c]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select
                value={filters.status ?? ""}
                onChange={(e) => set("status", e.target.value as SaleStatusKey | "")}
              >
                <option value="">Todos</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {SALE_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Cajero / vendedor</Label>
              <Select
                value={filters.cashierId ?? ""}
                onChange={(e) => set("cashierId", e.target.value)}
              >
                <option value="">Todos</option>
                {cashierOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Cliente</Label>
              <Input
                placeholder="Nombre, teléfono, cédula/RNC…"
                value={filters.customerQuery ?? ""}
                onChange={(e) => set("customerQuery", e.target.value)}
              />
            </div>
            <div>
              <Label>Producto / servicio</Label>
              <Input
                placeholder="Nombre o SKU del producto…"
                value={filters.productQuery ?? ""}
                onChange={(e) => set("productQuery", e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!filters.includeProformas}
                  onChange={(e) => set("includeProformas", e.target.checked)}
                />
                Incluir proformas
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPIs ── */}
      <div className="mb-6">
        <ReportSummaryCards items={kpiItems} columns={5} />
      </div>

      {/* ── Gráficas / resúmenes ── */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tendencia de ventas</CardTitle>
          </CardHeader>
          <CardContent>
            {report.trend.length ? (
              <BarChart data={report.trend} formatter={formatCurrency} />
            ) : (
              <p className="text-sm opacity-60">Sin datos para el rango.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Medios de pago</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={report.methods.map((m) => ({ label: m.label, value: m.amount }))}
              formatter={formatCurrency}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ventas por sucursal</CardTitle>
          </CardHeader>
          <CardContent>
            {report.branches.length ? (
              <BarChart
                data={report.branches.map((b) => ({ label: b.name, value: b.total }))}
                formatter={formatCurrency}
              />
            ) : (
              <p className="text-sm opacity-60">Sin datos.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top cajeros / vendedores</CardTitle>
          </CardHeader>
          <CardContent>
            {report.cashiers.length ? (
              <BarChart
                data={report.cashiers.map((c) => ({ label: c.name, value: c.total }))}
                formatter={formatCurrency}
              />
            ) : (
              <p className="text-sm opacity-60">Sin datos.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Productos más vendidos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH className="text-right">Cant.</TH>
                  <TH className="text-right">Monto</TH>
                </TR>
              </THead>
              <TBody>
                {report.products.slice(0, 10).map((p) => (
                  <TR key={p.productId}>
                    <TD className="text-sm">{p.name}</TD>
                    <TD className="text-right tabular-nums">{p.quantity}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(p.total)}</TD>
                  </TR>
                ))}
                {!report.products.length && (
                  <TR>
                    <TD colSpan={3} className="py-6 text-center text-sm opacity-60">
                      Sin productos.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clientes principales</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH className="text-right">Compras</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {report.customers.slice(0, 10).map((c, i) => (
                  <TR key={`${c.name}-${i}`}>
                    <TD className="text-sm">{c.name}</TD>
                    <TD className="text-right tabular-nums">{c.purchases}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(c.total)}</TD>
                  </TR>
                ))}
                {!report.customers.length && (
                  <TR>
                    <TD colSpan={3} className="py-6 text-center text-sm opacity-60">
                      Sin clientes.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comprobantes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Tipo</TH>
                  <TH className="text-right">Cant.</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {report.comprobantes.map((c) => (
                  <TR key={c.key}>
                    <TD className="text-sm">{c.label}</TD>
                    <TD className="text-right tabular-nums">{c.count}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(c.total)}</TD>
                  </TR>
                ))}
                {!report.comprobantes.length && (
                  <TR>
                    <TD colSpan={3} className="py-6 text-center text-sm opacity-60">
                      Sin comprobantes.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabla detallada (interactiva, solo pantalla) ── */}
      <Card className="screen-only">
        <CardHeader>
          <CardTitle>Detalle de ventas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <SortableTH sortKey="date" state={sort} onClick={toggle}>Fecha y hora</SortableTH>
                <TH>Sucursal</TH>
                <TH>Comprobante</TH>
                <SortableTH sortKey="documentType" state={sort} onClick={toggle}>Tipo documento</SortableTH>
                <SortableTH sortKey="customer" state={sort} onClick={toggle}>Cliente</SortableTH>
                <SortableTH sortKey="cashier" state={sort} onClick={toggle}>Cajero</SortableTH>
                <TH className="text-right">Items</TH>
                <SortableTH sortKey="method" state={sort} onClick={toggle}>Método</SortableTH>
                <TH className="text-right">Subtotal</TH>
                <TH className="text-right">ITBIS</TH>
                <TH className="text-right">Desc.</TH>
                <SortableTH sortKey="total" state={sort} onClick={toggle} align="right">Total</SortableTH>
                <SortableTH sortKey="status" state={sort} onClick={toggle}>Estado</SortableTH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {empty && (
                <TR>
                  <TD colSpan={14} className="py-10 text-center text-sm opacity-60">
                    No hay ventas para los filtros seleccionados.
                  </TD>
                </TR>
              )}
              {pag.pageItems.map((p) => {
                const base = documentRouteBase(p);
                const status = saleStatusKey(p.status);
                const method = saleMethodSummary(p);
                const items = p.items.reduce((q, it) => q + it.quantity, 0);
                const editable =
                  canEdit && isInvoiceDocument(p) && documentEditability(p).editable;
                return (
                  <TR key={p.id}>
                    <TD className="text-xs">{formatDateTime(p.createdAt)}</TD>
                    <TD className="text-sm">{branchNames.get(p.branchId) ?? "Sucursal"}</TD>
                    <TD>
                      <Link
                        href={`${base}/${p.id}`}
                        className="font-mono text-xs hover:text-[color:var(--brand-accent)]"
                      >
                        {p.ecfNumber ?? p.number}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={saleDocumentTone(p)}>{comprobanteLabel(p)}</Badge>
                    </TD>
                    <TD className="text-sm">{p.customerName || "Consumidor final"}</TD>
                    <TD className="text-sm opacity-70">{p.cashierName || "—"}</TD>
                    <TD className="text-right tabular-nums">{items}</TD>
                    <TD className="text-sm">{SALE_METHOD_LABEL[method]}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(p.subtotal)}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(p.itbis)}</TD>
                    <TD className="text-right tabular-nums">
                      {formatCurrency(p.discount || p.discountAmount || 0)}
                    </TD>
                    <TD className="text-right tabular-nums font-medium">
                      {formatCurrency(p.total)}
                    </TD>
                    <TD>
                      <Badge tone={SALE_STATUS_TONE[status]}>{SALE_STATUS_LABEL[status]}</Badge>
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        variant="menu"
                        align="end"
                        customActions={[
                          { label: "Ver detalle", icon: Eye, href: `${base}/${p.id}` },
                          {
                            label: "Editar",
                            icon: Pencil,
                            ...(editable
                              ? { href: `${base}/${p.id}/editar` }
                              : {
                                  disabled: true,
                                  disabledReason: !canEdit
                                    ? "No tienes permiso para editar."
                                    : !isInvoiceDocument(p)
                                      ? "Las proformas se editan desde su pantalla."
                                      : documentEditability(p).reason ??
                                        "Este documento no se puede editar.",
                                }),
                          },
                          { label: "Imprimir", icon: Printer, href: `${base}/${p.id}/print` },
                          { label: "Enviar WhatsApp", icon: Send, onClick: () => handleShareWhatsapp(p) },
                          {
                            label: "Descargar PDF",
                            icon: FileDown,
                            href: `/api/proformas/${p.id}/pdf`,
                            external: true,
                          },
                          { label: "Ver pagos", icon: CreditCard, onClick: () => setPaymentsFor(p) },
                          {
                            label: "Ver movimientos de inventario",
                            icon: Boxes,
                            href: "/reportes/inventario",
                          },
                          {
                            label: "Anular",
                            icon: Ban,
                            destructive: true,
                            ...(canEdit && status !== "cancelled"
                              ? {
                                  onClick: () => handleAnular(p),
                                  confirm: {
                                    title: "Anular documento",
                                    message:
                                      "Se marcará como anulado. Esta acción no se puede deshacer.",
                                  },
                                }
                              : {
                                  disabled: true,
                                  disabledReason:
                                    status === "cancelled"
                                      ? "El documento ya está anulado."
                                      : "No tienes permiso para anular.",
                                }),
                          },
                        ]}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {!empty && (
            <DataPagination
              page={pag.page}
              pageSize={pag.pageSize}
              total={pag.total}
              onPageChange={pag.setPage}
              onPageSizeChange={pag.setPageSize}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Detalle COMPLETO solo para impresión / PDF (todos los filtrados) ── */}
      <div className="print-only">
        <Card>
          <CardHeader>
            <CardTitle>Detalle de ventas ({sorted.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Sucursal</TH>
                  <TH>Comprobante</TH>
                  <TH>Tipo</TH>
                  <TH>Cliente</TH>
                  <TH>Cajero</TH>
                  <TH className="text-right">Items</TH>
                  <TH>Método</TH>
                  <TH className="text-right">ITBIS</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {sorted.map((p) => {
                  const status = saleStatusKey(p.status);
                  const method = saleMethodSummary(p);
                  const items = p.items.reduce((q, it) => q + it.quantity, 0);
                  return (
                    <TR key={`print-${p.id}`}>
                      <TD className="text-xs">{formatDate(p.createdAt)}</TD>
                      <TD className="text-xs">{branchNames.get(p.branchId) ?? "Sucursal"}</TD>
                      <TD className="font-mono text-xs">{p.ecfNumber ?? p.number}</TD>
                      <TD className="text-xs">{comprobanteLabel(p)}</TD>
                      <TD className="text-xs">{p.customerName || "Consumidor final"}</TD>
                      <TD className="text-xs">{p.cashierName || "—"}</TD>
                      <TD className="text-right tabular-nums text-xs">{items}</TD>
                      <TD className="text-xs">{SALE_METHOD_LABEL[method]}</TD>
                      <TD className="text-right tabular-nums text-xs">{formatCurrency(p.itbis)}</TD>
                      <TD className="text-right tabular-nums text-xs font-medium">{formatCurrency(p.total)}</TD>
                      <TD className="text-xs">{SALE_STATUS_LABEL[status]}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ReportFooter
        businessName="DermaLand"
        reportName="Reporte de ventas"
        generatedAt={generatedAt}
      />
      </ReportLayout>

      {/* ── Modal: ver pagos ── */}
      <Modal
        open={!!paymentsFor}
        title={`Pagos · ${paymentsFor?.ecfNumber ?? paymentsFor?.number ?? ""}`}
        onClose={() => setPaymentsFor(null)}
      >
        {paymentsFor && paymentsFor.payments.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Método</TH>
                <TH>Referencia</TH>
                <TH>Fecha</TH>
                <TH className="text-right">Monto</TH>
              </TR>
            </THead>
            <TBody>
              {paymentsFor.payments.map((pay) => (
                <TR key={pay.id}>
                  <TD className="text-sm">
                    {PAYMENT_GROUP_LABEL[paymentMethodGroup(pay.method)]}
                  </TD>
                  <TD className="text-sm opacity-70">{pay.last4 ?? pay.reference ?? "—"}</TD>
                  <TD className="text-xs">{formatDateTime(pay.createdAt)}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(pay.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="text-sm opacity-60">Este documento no tiene pagos registrados.</p>
        )}
      </Modal>

      <toast.Toast />
    </>
  );
}
