"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { SortableTH, useTableSort } from "@/components/ui/sortable-table-header";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import {
  ReportLayout,
  ReportHeader,
  ReportSummaryCards,
  ReportFiltersSummary,
  ReportFooter,
  type ReportKpi,
  type ReportFilterChip,
} from "@/components/reporting/report-layout";
import { ExportPdfButton } from "@/components/reporting/export-pdf-button";
import { makePdfMeta } from "@/lib/reports/pdf/meta";
import { useToast } from "@/components/ui/toast";
import { CheckCircle2, FileSpreadsheet, HandCoins, Layers, SlidersHorizontal, Gift } from "lucide-react";
import { useProformas } from "@/features/sales/proforma-store";
import { useBranches, useActiveBranches } from "@/features/tenancy/branch-store";
import { mockCurrentUser } from "@/lib/mock-data/users";
import {
  canViewCommissionReport,
  canExportCommissionReport,
  canManageCommission,
} from "@/features/billing/permissions";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";
import {
  quickRange,
  SALE_METHOD_LABEL,
  SALE_STATUS_LABEL,
  type QuickRangeKey,
  type SaleMethodSummary,
  type SaleStatusKey,
} from "@/features/sales/sales-report";
import {
  COMMISSION_STATUS_LABEL,
  type CommissionFilters,
  type CommissionLine,
  type CommissionStatus,
} from "@/features/reports/commission/commission-engine";
import { commissionReportFromIncentives } from "@/features/commission/report-from-incentives";
import { useIncentives } from "@/features/incentives/incentive-store";
import { useCommissionRules } from "@/features/reports/commission/commission-rules-store";
import { CommissionRulesModal } from "@/features/reports/commission/commission-rules-modal";
import {
  useCommissionExclusions,
  saveExclusion,
  deleteExclusion,
  excludedComprobantes,
} from "@/features/reports/commission/commission-exclusions-store";
import { usePayouts, setPayout } from "@/features/reports/commission/commission-payout-store";
import { createBatch } from "@/features/reports/commission/commission-batch-store";
import { recordCommissionAudit } from "@/features/reports/commission/commission-audit-store";
import { CommissionPaymentsModal } from "@/features/reports/commission/commission-payments-modal";
import { buildCommissionPdfSpec } from "@/features/reports/commission/commission-report-pdf";
import type { ReportMeta } from "@/lib/reports/excel/types";

const QUICK_RANGES: { key: QuickRangeKey; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "last7", label: "Últimos 7 días" },
  { key: "thisMonth", label: "Este mes" },
  { key: "lastMonth", label: "Mes anterior" },
  { key: "all", label: "Todo" },
];

const METHOD_OPTIONS: SaleMethodSummary[] = ["cash", "card", "transfer", "other", "mixed"];
const STATUS_OPTIONS: SaleStatusKey[] = ["paid", "pending", "cancelled", "returned", "partial"];
const COMMISSION_STATUS_OPTIONS: CommissionStatus[] = [
  "commissionable",
  "excluded",
  "cancelled",
  "no_rule",
];

const EMPTY: CommissionFilters = {
  from: "",
  to: "",
  branchId: "",
  method: "",
  status: "",
  cashierId: "",
  sellerId: "",
  customerQuery: "",
  commissionStatus: "",
  ruleId: "",
  comprobanteQuery: "",
};

const COMPARATORS = {
  date: (a: CommissionLine, b: CommissionLine) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  comprobante: (a: CommissionLine, b: CommissionLine) =>
    a.comprobante.localeCompare(b.comprobante, "es"),
  seller: (a: CommissionLine, b: CommissionLine) => a.seller.localeCompare(b.seller, "es"),
  base: (a: CommissionLine, b: CommissionLine) => a.base - b.base,
  commission: (a: CommissionLine, b: CommissionLine) => a.commission - b.commission,
  status: (a: CommissionLine, b: CommissionLine) => a.status.localeCompare(b.status),
} as const;

const STATUS_TONE: Record<CommissionStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  commissionable: "info",
  excluded: "warning",
  cancelled: "danger",
  no_rule: "neutral",
};

function ReporteComisionVentasContent() {
  const toast = useToast();
  const all = useProformas();
  const branches = useBranches();
  const activeBranches = useActiveBranches();

  // Deep-link desde Ventas > Incentivos (flujo único): `?seller=&from=&to=`
  // abren el reporte ya filtrado por ese vendedor y período. Fuente canónica de
  // filtros compartida entre ambos módulos (§3/§13).
  const params = useSearchParams();
  const initialFilters = React.useMemo<CommissionFilters>(() => {
    const seller = params.get("seller") ?? "";
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    if (!seller && !from && !to) return EMPTY;
    return { ...EMPTY, sellerId: seller, from, to };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canView = canViewCommissionReport(mockCurrentUser.role);
  const canExport = canExportCommissionReport(mockCurrentUser.role);
  const canManage = canManageCommission(mockCurrentUser.role);
  const rules = useCommissionRules();
  const exclusions = useCommissionExclusions();
  const exclusionList = React.useMemo(() => excludedComprobantes(exclusions), [exclusions]);
  const payouts = usePayouts();

  const [filters, setFilters] = React.useState<CommissionFilters>(initialFilters);
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [paymentsOpen, setPaymentsOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [excludeTarget, setExcludeTarget] = React.useState<CommissionLine | null>(null);
  const [excludeReason, setExcludeReason] = React.useState("");
  const [generatedAt, setGeneratedAt] = React.useState("");
  React.useEffect(() => {
    setGeneratedAt(formatDateTime(new Date().toISOString()));
  }, []);

  const branchNames = React.useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );

  const sellerOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of all) if (p.sellerId) map.set(p.sellerId, p.sellerName || "Vendedor");
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [all]);

  const cashierOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of all) if (p.cashierId) map.set(p.cashierId, p.cashierName || "Cajero");
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [all]);

  // FUENTE ÚNICA: el reporte se construye desde los snapshots `sales_incentives`
  // (los mismos que muestra Ventas > Incentivos), enriquecidos con sus ventas.
  // Ya no hay recálculo dinámico duplicado (§1/§8).
  const { incentives } = useIncentives({});
  const salesById = React.useMemo(
    () => new Map(all.map((p) => [p.id, p])),
    [all],
  );
  const cashierNameById = React.useMemo(
    () => new Map(cashierOptions),
    [cashierOptions],
  );
  // Reglas presentes en los incentivos (para el filtro por regla).
  const ruleOptions = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const i of incentives) if (i.ruleId) m.set(i.ruleId, i.ruleName ?? "Regla");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [incentives]);

  const report = React.useMemo(
    () =>
      commissionReportFromIncentives(incentives, salesById, filters, {
        branchNames,
        manualExclusions: exclusionList,
        payoutByComprobante: payouts,
        cashierNameById,
      }),
    [incentives, salesById, filters, branchNames, exclusionList, payouts, cashierNameById],
  );

  const { sort, sorted, toggle } = useTableSort(report.rows, "date", "desc", COMPARATORS);
  const pag = usePagination(sorted, { resetKey: JSON.stringify(filters) });

  const set = <K extends keyof CommissionFilters>(key: K, value: CommissionFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const applyQuick = (key: QuickRangeKey) => {
    const { from, to } = quickRange(key);
    setFilters((f) => ({ ...f, from, to }));
  };
  const clearFilters = () => setFilters(EMPTY);

  const openExclude = (l: CommissionLine) => {
    setExcludeReason("");
    setExcludeTarget(l);
  };
  const confirmExclude = async () => {
    if (!excludeTarget) return;
    const res = await saveExclusion({
      comprobante: excludeTarget.comprobante,
      reason: excludeReason,
      userName: mockCurrentUser.fullName,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Comprobante ${excludeTarget.comprobante} excluido de comisión.`);
    setExcludeTarget(null);
  };
  const includeBack = async (l: CommissionLine) => {
    const res = await deleteExclusion(l.comprobante);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo incluir la comisión.");
      return;
    }
    toast.success(`Comprobante ${l.comprobante} vuelve a comisionar.`);
  };

  // ── Selección y pago de comisiones (§12/§13) ──
  const toggleSelect = (comprobante: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(comprobante)) next.delete(comprobante);
      else next.add(comprobante);
      return next;
    });
  const selectableOnPage = () =>
    pag.pageItems.filter((l) => l.status === "commissionable").map((l) => l.comprobante);
  const allPageSelected = () => {
    const s = selectableOnPage();
    return s.length > 0 && s.every((c) => selected.has(c));
  };
  const toggleSelectAllPage = () =>
    setSelected((prev) => {
      const s = selectableOnPage();
      const next = new Set(prev);
      if (s.every((c) => next.has(c))) s.forEach((c) => next.delete(c));
      else s.forEach((c) => next.add(c));
      return next;
    });

  const selectedLines = report.rows.filter(
    (l) => l.status === "commissionable" && selected.has(l.comprobante),
  );
  const selectedTotal = selectedLines.reduce((s, l) => s + l.commission, 0);
  const who = mockCurrentUser.fullName;

  const approveSelected = async () => {
    if (!selectedLines.length) return;
    const comps = selectedLines.map((l) => l.comprobante);
    const res = await setPayout(comps, "approved", { userName: who });
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo aprobar la comisión.");
      return;
    }
    await recordCommissionAudit({ action: "approved", comprobantes: comps, amount: selectedTotal, userName: who });
    toast.success(`${comps.length} comisión(es) aprobada(s).`);
    setSelected(new Set());
  };
  const paySelected = async () => {
    if (!selectedLines.length) return;
    const comps = selectedLines.map((l) => l.comprobante);
    const res = await setPayout(comps, "paid", { userName: who });
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo marcar como pagada.");
      return;
    }
    await recordCommissionAudit({ action: "paid", comprobantes: comps, amount: selectedTotal, userName: who });
    toast.success(`${comps.length} comisión(es) marcada(s) como pagada(s).`);
    setSelected(new Set());
  };
  const createBatchFromSelected = async () => {
    if (!selectedLines.length) return;
    const comps = selectedLines.map((l) => l.comprobante);
    const sellerName =
      filters.sellerId && filters.sellerId !== "__none__"
        ? sellerOptions.find((c) => c[0] === filters.sellerId)?.[1]
        : undefined;
    const res = await createBatch({
      comprobantes: comps,
      total: selectedTotal,
      periodFrom: filters.from,
      periodTo: filters.to,
      sellerId: filters.sellerId || undefined,
      sellerName,
      userName: who,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Lote de pago creado: ${comps.length} comisión(es), ${formatCurrency(selectedTotal)}.`);
    setSelected(new Set());
  };

  // ── Metadatos compartidos por Excel y PDF ──
  const rangeLabel =
    filters.from || filters.to ? `${filters.from || "inicio"} a ${filters.to || "hoy"}` : "Todo";
  const branchLabel = filters.branchId
    ? branchNames.get(filters.branchId) ?? "Sucursal"
    : "Todas las sucursales";
  const filtersLabel = React.useMemo(() => {
    const parts: string[] = [];
    if (filters.method) parts.push(`Método: ${SALE_METHOD_LABEL[filters.method]}`);
    if (filters.status) parts.push(`Estado venta: ${SALE_STATUS_LABEL[filters.status]}`);
    if (filters.commissionStatus)
      parts.push(`Estado comisión: ${COMMISSION_STATUS_LABEL[filters.commissionStatus]}`);
    if (filters.ruleId)
      parts.push(`Regla: ${ruleOptions.find(([id]) => id === filters.ruleId)?.[1] ?? ""}`);
    if (filters.sellerId)
      parts.push(
        `Vendedor: ${
          filters.sellerId === "__none__"
            ? "No asignado"
            : sellerOptions.find((c) => c[0] === filters.sellerId)?.[1] ?? ""
        }`,
      );
    if (filters.cashierId)
      parts.push(`Cajero: ${cashierOptions.find((c) => c[0] === filters.cashierId)?.[1] ?? ""}`);
    if (filters.customerQuery) parts.push(`Cliente: ${filters.customerQuery}`);
    if (filters.comprobanteQuery) parts.push(`Comprobante: ${filters.comprobanteQuery}`);
    return parts.length ? parts.join(" · ") : "Sin filtros adicionales";
  }, [filters, sellerOptions, cashierOptions, ruleOptions]);

  const excelMeta = (): ReportMeta => ({
    title: "Reporte de Comisión de Ventas",
    subtitle: "Comisiones por vendedor, método de pago y sucursal.",
    rangeLabel,
    branchLabel,
    filtersLabel,
    generatedBy: mockCurrentUser.fullName,
    generatedAtLabel: formatDateTime(new Date().toISOString()),
  });

  const pdfSpec = () =>
    buildCommissionPdfSpec(
      report,
      makePdfMeta({
        title: "Reporte de Comisión de Ventas",
        subtitle: "Comisiones por vendedor, método de pago y sucursal.",
        reportKind: "Comisión de ventas",
        cutLabel: `Fecha de corte: ${formatDate(new Date().toISOString())}`,
        periodLabel: rangeLabel,
        branchLabel,
        filtersLabel,
        generatedBy: mockCurrentUser.fullName,
        generatedAtLabel: formatDateTime(new Date().toISOString()),
      }),
    );

  const exportExcel = async () => {
    toast.show("Generando Excel…", "info");
    try {
      const [{ exportProfessionalWorkbook, reportFileName }, { buildCommissionWorkbookSpec }] =
        await Promise.all([
          import("@/lib/reports/excel/professional-workbook"),
          import("@/features/reports/commission/commission-report-excel"),
        ]);
      const spec = buildCommissionWorkbookSpec(report, excelMeta());
      await exportProfessionalWorkbook(spec, reportFileName("Reporte_Comision_Ventas"));
      toast.show("Excel generado correctamente.", "success");
    } catch {
      toast.error("No se pudo generar el Excel. Intenta nuevamente.");
    }
  };

  const k = report.kpis;
  const kpiItems: ReportKpi[] = [
    { label: "Ventas comisionables", value: k.commissionableSales, tone: "primary" },
    { label: "Base comisionable", value: formatCurrency(k.commissionableBase) },
    { label: "Comisión 3%", value: formatCurrency(k.commission3) },
    { label: "Comisión 1%", value: formatCurrency(k.commission1) },
    { label: "Comisión total", value: formatCurrency(k.commissionTotal), tone: "success" },
    { label: "Ventas excluidas", value: k.excludedSales, tone: k.excludedSales ? "warning" : "default" },
    { label: "Pendiente de pago", value: formatCurrency(k.pendingCommission), tone: "warning" },
    { label: "Pagada", value: formatCurrency(k.paidCommission) },
  ];

  const filterChips: ReportFilterChip[] = [];
  if (filters.from || filters.to)
    filterChips.push({ label: "Fecha", value: `${filters.from || "inicio"} → ${filters.to || "hoy"}` });
  if (filters.branchId) filterChips.push({ label: "Sucursal", value: branchLabel });
  if (filters.method) filterChips.push({ label: "Método", value: SALE_METHOD_LABEL[filters.method] });
  if (filters.commissionStatus)
    filterChips.push({ label: "Comisión", value: COMMISSION_STATUS_LABEL[filters.commissionStatus] });
  if (filters.sellerId)
    filterChips.push({
      label: "Vendedor",
      value:
        filters.sellerId === "__none__"
          ? "No asignado"
          : sellerOptions.find((c) => c[0] === filters.sellerId)?.[1] ?? "",
    });

  if (!canView) {
    return (
      <>
        <PageHeader
          title="Comisión ventas"
          description="Reporte de comisiones de ventas."
          breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Comisión ventas" }]}
        />
        <Card>
          <CardContent>
            <p className="py-10 text-center text-sm opacity-70">
              No tienes permiso para ver el reporte de comisiones.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  const empty = report.rows.length === 0;

  return (
    <>
      <PageHeader
        title="Comisión ventas"
        description="Comisiones calculadas sobre ventas reales, por vendedor, método de pago y sucursal."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Comisión ventas" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {/* §7: las reglas se administran en Ventas > Incentivos (fuente única). */}
            <Link href="/ventas/incentivos" aria-label="Gestionar reglas en Incentivos">
              <Button variant="outline" size="sm">
                <Gift className="h-4 w-4" />
                Gestionar reglas en Incentivos
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              {canManage ? "Reglas (avanzado)" : "Ver reglas"}
            </Button>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setPaymentsOpen(true)}>
                <HandCoins className="h-4 w-4" />
                Pagos y auditoría
              </Button>
            )}
            {canExport && (
              <>
                <ExportPdfButton getSpec={pdfSpec} fileSlug="Reporte_Comision_Ventas" />
                <Button variant="outline" size="sm" onClick={exportExcel}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar Excel
                </Button>
              </>
            )}
          </div>
        }
      />

      <ReportLayout>
        <ReportHeader
          businessName="DermaLand"
          title="Reporte de Comisión de Ventas"
          subtitle="Comisión 3% (efectivo/transferencia) y 1% (tarjeta) sobre la base antes de impuestos."
          generatedBy={mockCurrentUser.fullName}
          generatedAt={generatedAt}
        />

        <ReportFiltersSummary filters={filterChips} />

        {/* ── Filtros ── */}
        <Card className="mb-6 no-print">
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {QUICK_RANGES.map((q) => (
                <Button key={q.key} size="sm" variant="outline" onClick={() => applyQuick(q.key)}>
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
                <Input type="date" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value)} />
              </div>
              <div>
                <Label>Hasta</Label>
                <Input type="date" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value)} />
              </div>
              <div>
                <Label>Sucursal</Label>
                <Select value={filters.branchId ?? ""} onChange={(e) => set("branchId", e.target.value)}>
                  <option value="">Todas las sucursales</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Vendedor</Label>
                <Select value={filters.sellerId ?? ""} onChange={(e) => set("sellerId", e.target.value)}>
                  <option value="">Todos</option>
                  {sellerOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                  <option value="__none__">Ventas sin vendedor</option>
                </Select>
              </div>
              <div>
                <Label>Cajero</Label>
                <Select value={filters.cashierId ?? ""} onChange={(e) => set("cashierId", e.target.value)}>
                  <option value="">Todos</option>
                  {cashierOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Método de pago</Label>
                <Select
                  value={filters.method ?? ""}
                  onChange={(e) => set("method", e.target.value as SaleMethodSummary | "")}
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
                <Label>Estado de venta</Label>
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
                <Label>Estado de comisión</Label>
                <Select
                  value={filters.commissionStatus ?? ""}
                  onChange={(e) => set("commissionStatus", e.target.value as CommissionStatus | "")}
                >
                  <option value="">Todos</option>
                  {COMMISSION_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {COMMISSION_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Regla de comisión</Label>
                <Select value={filters.ruleId ?? ""} onChange={(e) => set("ruleId", e.target.value)}>
                  <option value="">Todas</option>
                  {ruleOptions.map(([id, name]) => (
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
                <Label>Número de comprobante</Label>
                <Input
                  placeholder="B0200012923…"
                  value={filters.comprobanteQuery ?? ""}
                  onChange={(e) => set("comprobanteQuery", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── KPIs ── */}
        <div className="mb-6">
          <ReportSummaryCards items={kpiItems} columns={4} />
        </div>

        {/* ── Comisión por vendedor ── */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Comisión por vendedor</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Vendedor</TH>
                  <TH className="text-right">Ventas</TH>
                  <TH className="text-right">Base comisionable</TH>
                  <TH className="text-right">Comisión 3%</TH>
                  <TH className="text-right">Comisión 1%</TH>
                  <TH className="text-right">Comisión total</TH>
                  <TH className="text-right">Pendiente</TH>
                </TR>
              </THead>
              <TBody>
                {report.bySeller.map((s) => (
                  <TR key={s.sellerId}>
                    <TD className="text-sm">{s.sellerName}</TD>
                    <TD className="text-right tabular-nums">{s.sales}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(s.base)}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(s.commission3)}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(s.commission1)}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {formatCurrency(s.commissionTotal)}
                    </TD>
                    <TD className="text-right tabular-nums">{formatCurrency(s.pending)}</TD>
                  </TR>
                ))}
                {!report.bySeller.length && (
                  <TR>
                    <TD colSpan={7} className="py-6 text-center text-sm opacity-60">
                      Sin comisiones para los filtros seleccionados.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Por método + Por sucursal ── */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Comisión por método de pago</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Método</TH>
                    <TH className="text-right">Ventas</TH>
                    <TH className="text-right">Base</TH>
                    <TH className="text-right">%</TH>
                    <TH className="text-right">Comisión</TH>
                  </TR>
                </THead>
                <TBody>
                  {report.byMethod.map((m) => (
                    <TR key={m.group}>
                      <TD className="text-sm">{m.label}</TD>
                      <TD className="text-right tabular-nums">{m.sales}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(m.base)}</TD>
                      <TD className="text-right tabular-nums">{m.ratePercent}%</TD>
                      <TD className="text-right tabular-nums font-medium">{formatCurrency(m.commission)}</TD>
                    </TR>
                  ))}
                  {!report.byMethod.length && (
                    <TR>
                      <TD colSpan={5} className="py-6 text-center text-sm opacity-60">
                        Sin datos.
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Comisión por sucursal</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Sucursal</TH>
                    <TH className="text-right">Ventas</TH>
                    <TH className="text-right">Base</TH>
                    <TH className="text-right">Comisión</TH>
                    <TH className="text-right">Pendiente</TH>
                  </TR>
                </THead>
                <TBody>
                  {report.byBranch.map((b) => (
                    <TR key={b.branchId}>
                      <TD className="text-sm">{b.branchName}</TD>
                      <TD className="text-right tabular-nums">{b.sales}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(b.base)}</TD>
                      <TD className="text-right tabular-nums font-medium">{formatCurrency(b.commission)}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(b.pending)}</TD>
                    </TR>
                  ))}
                  {!report.byBranch.length && (
                    <TR>
                      <TD colSpan={5} className="py-6 text-center text-sm opacity-60">
                        Sin datos.
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* ── Detalle de comisiones ── */}
        <Card>
          <CardHeader>
            <CardTitle>Detalle de comisiones</CardTitle>
          </CardHeader>
          {canManage && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-[color:var(--brand-primary)]/[0.04] px-4 py-2 text-sm">
              <span className="font-medium">
                {selectedLines.length} seleccionada(s) · {formatCurrency(selectedTotal)}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={approveSelected}>
                  <CheckCircle2 className="h-4 w-4" /> Aprobar
                </Button>
                <Button size="sm" variant="outline" onClick={paySelected}>
                  <HandCoins className="h-4 w-4" /> Marcar pagadas
                </Button>
                <Button size="sm" onClick={createBatchFromSelected}>
                  <Layers className="h-4 w-4" /> Crear lote de pago
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Limpiar
                </Button>
              </div>
            </div>
          )}
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  {canManage && (
                    <TH className="w-8 pl-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        aria-label="Seleccionar todo"
                        checked={allPageSelected()}
                        onChange={toggleSelectAllPage}
                      />
                    </TH>
                  )}
                  <SortableTH sortKey="date" state={sort} onClick={toggle}>Fecha</SortableTH>
                  <SortableTH sortKey="comprobante" state={sort} onClick={toggle}>Comprobante</SortableTH>
                  <TH>Cliente</TH>
                  <SortableTH sortKey="seller" state={sort} onClick={toggle}>Vendedor</SortableTH>
                  <TH>Cajero</TH>
                  <TH>Sucursal</TH>
                  <TH>Método</TH>
                  <TH className="text-right">Subtotal</TH>
                  <TH className="text-right">Desc.</TH>
                  <SortableTH sortKey="base" state={sort} onClick={toggle} align="right">Base</SortableTH>
                  <TH className="text-right">ITBIS</TH>
                  <TH>Regla</TH>
                  <TH className="text-right">%</TH>
                  <SortableTH sortKey="commission" state={sort} onClick={toggle} align="right">Comisión</SortableTH>
                  <SortableTH sortKey="status" state={sort} onClick={toggle}>Estado</SortableTH>
                  {canManage && <TH className="text-right pr-4">Acciones</TH>}
                </TR>
              </THead>
              <TBody>
                {empty && (
                  <TR>
                    <TD colSpan={canManage ? 17 : 15} className="py-10 text-center text-sm opacity-60">
                      No hay ventas para los filtros seleccionados.
                    </TD>
                  </TR>
                )}
                {pag.pageItems.map((l) => (
                  <TR key={l.id}>
                    {canManage && (
                      <TD className="pl-4">
                        {l.status === "commissionable" ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            aria-label={`Seleccionar ${l.comprobante}`}
                            checked={selected.has(l.comprobante)}
                            onChange={() => toggleSelect(l.comprobante)}
                          />
                        ) : null}
                      </TD>
                    )}
                    <TD className="text-xs">{formatDate(l.date)}</TD>
                    <TD className="font-mono text-xs">{l.comprobante}</TD>
                    <TD className="text-sm">{l.customer}</TD>
                    <TD className="text-sm">{l.seller}</TD>
                    <TD className="text-sm opacity-70">{l.cashier}</TD>
                    <TD className="text-sm">{l.branchName}</TD>
                    <TD className="text-sm">{l.methodLabel}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(l.subtotal)}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(l.discount)}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(l.base)}</TD>
                    <TD className="text-right tabular-nums opacity-70">{formatCurrency(l.itbis)}</TD>
                    <TD className="text-xs">{l.ruleName}</TD>
                    <TD className="text-right tabular-nums">{l.ratePercent ? `${l.ratePercent}%` : "—"}</TD>
                    <TD className="text-right tabular-nums font-medium">{formatCurrency(l.commission)}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[l.status]}>
                        {l.status === "commissionable" ? l.payoutLabel : l.statusLabel}
                      </Badge>
                    </TD>
                    {canManage && (
                      <TD className="pr-4 text-right">
                        {l.status === "commissionable" ? (
                          <button
                            type="button"
                            onClick={() => openExclude(l)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                          >
                            Excluir
                          </button>
                        ) : l.status === "excluded" ? (
                          <button
                            type="button"
                            onClick={() => includeBack(l)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-[color:var(--brand-accent)] hover:bg-black/5"
                          >
                            Incluir
                          </button>
                        ) : (
                          <span className="text-xs opacity-40">—</span>
                        )}
                      </TD>
                    )}
                  </TR>
                ))}
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

        <ReportFooter businessName="DermaLand" reportName="Comisión de ventas" generatedAt={generatedAt} />
      </ReportLayout>

      <CommissionRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        branches={activeBranches.map((b) => ({ id: b.id, name: b.name }))}
        canManage={canManage}
      />

      <CommissionPaymentsModal open={paymentsOpen} onClose={() => setPaymentsOpen(false)} />

      <Modal
        open={!!excludeTarget}
        title="Excluir venta de comisión"
        onClose={() => setExcludeTarget(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setExcludeTarget(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmExclude}>
              Excluir comisión
            </Button>
          </>
        }
      >
        {excludeTarget && (
          <div className="space-y-3 text-sm">
            <p className="opacity-70">
              El comprobante <strong className="font-mono">{excludeTarget.comprobante}</strong>{" "}
              ({excludeTarget.customer}, {formatCurrency(excludeTarget.commission)} de comisión) dejará
              de sumar. La venta y sus pagos NO se modifican.
            </p>
            <div>
              <Label>
                Motivo de la exclusión <span className="text-rose-600">*</span>
              </Label>
              <Input
                autoFocus
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
                placeholder="Cortesía / venta interna / descuento sin comisión…"
              />
            </div>
          </div>
        )}
      </Modal>

      <toast.Toast />
    </>
  );
}

export default function ReporteComisionVentasPage() {
  return (
    <React.Suspense
      fallback={<div className="p-6 text-sm opacity-60">Cargando comisiones…</div>}
    >
      <ReporteComisionVentasContent />
    </React.Suspense>
  );
}
