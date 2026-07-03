"use client";

import * as React from "react";
import { Plus, Trophy, FlaskConical, X, FileSpreadsheet, FileText, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Button,
  Card,
  CardContent,
  Select,
  Input,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { StatCard } from "@/components/ui/stat-card";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { CatalogFormDialog } from "@/features/products/catalog-form-dialog";
import { useActiveBranches, getBranchDisplayName } from "@/features/tenancy/branch-store";
import { useProformas } from "@/features/sales/proforma-store";
import { useProducts } from "@/features/products/product-store";
import { formatCurrency } from "@/lib/utils/format";
import { downloadBlob } from "@/lib/utils/download";
import {
  computeLabSales,
  computeLabProductSales,
  summarizeLabSales,
} from "@/features/products/lab-sales";
// El módulo de exportación arrastra xlsx (~100 kB gz): se carga on-demand al exportar.
import type { LabSalesMeta } from "@/features/products/lab-sales-export";
import {
  useLaboratoriesList,
  saveLaboratory,
  deleteLaboratoryAnywhere,
  CATALOG_BACKEND,
} from "@/features/products/catalog-store";

const rankColor = (rank: number) =>
  rank === 1
    ? "bg-amber-400"
    : rank === 2
      ? "bg-slate-300"
      : rank === 3
        ? "bg-orange-300"
        : "bg-[color:var(--brand-primary)]/60";

export default function LaboratoriosPage() {
  const labs = useLaboratoriesList();
  const proformas = useProformas();
  const products = useProducts();
  const activeBranches = useActiveBranches();
  const toast = useToast();

  const [dialog, setDialog] = React.useState<{ mode: "create" | "edit"; id?: string; initial?: Record<string, string> } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isLocal = CATALOG_BACKEND === "local";

  const [q, setQ] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [topN, setTopN] = React.useState("all");

  const hasFilters =
    q.trim() !== "" || branch !== "" || from !== "" || to !== "" || topN !== "all";
  const clear = () => {
    setQ("");
    setBranch("");
    setFrom("");
    setTo("");
    setTopN("all");
  };

  const salesFilters = React.useMemo(
    () => ({
      branchId: branch || undefined,
      from: from || undefined,
      to: to || undefined,
      includeUnassigned: true,
    }),
    [branch, from, to],
  );

  // Ranking real: usa los productos REALES (Supabase) para el join
  // producto→laboratorio; con mock nunca cuadraba y todo salía en 0.
  const rows = React.useMemo(
    () => computeLabSales(labs, products, proformas, salesFilters),
    [labs, products, proformas, salesFilters],
  );

  const summary = React.useMemo(() => summarizeLabSales(rows), [rows]);

  const displayed = React.useMemo(() => {
    let r = rows;
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      r = r.filter((x) => x.lab.name.toLowerCase().includes(term));
    }
    if (topN !== "all") r = r.slice(0, Number(topN));
    return r;
  }, [rows, q, topN]);

  const exportMeta = (): LabSalesMeta => ({
    businessName: "DermaLand",
    generatedAt: new Date().toISOString(),
    branchLabel: branch ? getBranchDisplayName(branch) : "Todas las sucursales",
    rangeLabel: from || to ? `${from || "inicio"} a ${to || "hoy"}` : "Todo",
    searchLabel: q.trim() || "—",
  });

  const exportExcel = async () => {
    try {
      const { labSalesXlsxBytes, labSalesFilename } = await import(
        "@/features/products/lab-sales-export"
      );
      const productRows = computeLabProductSales(labs, products, proformas, salesFilters);
      downloadBlob(
        labSalesFilename("xlsx", new Date().toISOString().slice(0, 10)),
        labSalesXlsxBytes(rows, summary, productRows, exportMeta()),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      toast.success("Excel del ranking generado.");
    } catch {
      toast.error("No se pudo generar el Excel. Intenta nuevamente.");
    }
  };

  const exportCsv = async () => {
    try {
      const { buildLabSalesCsv, labSalesFilename } = await import(
        "@/features/products/lab-sales-export"
      );
      downloadBlob(
        labSalesFilename("csv", new Date().toISOString().slice(0, 10)),
        buildLabSalesCsv(rows),
        "text/csv;charset=utf-8",
      );
      toast.success("CSV del ranking generado.");
    } catch {
      toast.error("No se pudo generar el CSV. Intenta nuevamente.");
    }
  };

  const onSubmit = async (values: Record<string, string>) => {
    setSubmitting(true); setError(null);
    const res = await saveLaboratory(dialog!.mode, { name: values.name ?? "", country: values.country }, dialog?.id);
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    toast.success(dialog!.mode === "create" ? "Laboratorio creado." : "Cambios guardados.");
    setDialog(null);
  };

  return (
    <>
      <PageHeader
        title="Laboratorios"
        description="Ranking de laboratorios por ventas. Responde: ¿qué laboratorios venden más?"
        breadcrumbs={[
          { label: "Productos", href: "/productos" },
          { label: "Laboratorios" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileText className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" onClick={() => { setError(null); setDialog({ mode: "create", initial: {} }); }}>
              <Plus className="h-4 w-4" />
              Nuevo laboratorio
            </Button>
          </div>
        }
      />

      <div className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${isLocal ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        {isLocal
          ? "Los cambios se guardan en este equipo (modo demo, sin Supabase)."
          : "Los laboratorios son una fuente única compartida (Supabase)."}
      </div>

      {summary.hasUnassigned && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Hay productos vendidos sin laboratorio asignado (fila “Sin laboratorio”). Asígnales un laboratorio en Productos para verlos en el ranking.
        </div>
      )}

      {/* Resumen */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Laboratorio líder"
          value={summary.leader?.lab.name ?? "—"}
          icon={Trophy}
          tone="primary"
          hint={
            summary.leader
              ? formatCurrency(summary.leader.totalMoney)
              : "Sin ventas"
          }
        />
        <StatCard label="Laboratorios" value={summary.totalLabs} icon={FlaskConical} />
        <StatCard
          label="Ventas acumuladas"
          value={formatCurrency(summary.totalMoney)}
          icon={Trophy}
        />
        <StatCard label="Unidades vendidas" value={summary.totalUnits} icon={FlaskConical} />
      </div>

      {summary.top3.length > 0 && (
        <Card className="mb-4">
          <CardContent className="py-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-50">
              Top 3 laboratorios
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.top3.map((r) => (
                <span
                  key={r.lab.id}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-sm"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-black/70 ${rankColor(
                      r.rank,
                    )}`}
                  >
                    {r.rank}
                  </span>
                  <strong>{r.lab.name}</strong>
                  <span className="opacity-60">{formatCurrency(r.totalMoney)}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar laboratorio…"
          containerClassName="flex-1 min-w-[200px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Todas las sucursales</option>
          {activeBranches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          aria-label="Desde"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-auto"
        />
        <Input
          type="date"
          aria-label="Hasta"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-auto"
        />
        <Select value={topN} onChange={(e) => setTopN(e.target.value)}>
          <option value="all">Todos</option>
          <option value="3">Top 3</option>
          <option value="5">Top 5</option>
          <option value="10">Top 10</option>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="h-4 w-4" /> Limpiar filtros
          </Button>
        )}
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {/* Móvil: tarjetas (ranking) */}
          <div className="divide-y divide-slate-100 md:hidden">
            {displayed.length === 0 && (
              <div className="px-4 py-10 text-center text-sm opacity-60">
                {summary.hasSales
                  ? "Ningún laboratorio coincide con los filtros."
                  : "Aún no hay ventas registradas para mostrar el ranking."}
              </div>
            )}
            {displayed.map((r) => (
              <div key={r.lab.id || "unassigned"} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {!r.isUnassigned && (
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-black/70 ${rankColor(r.rank)}`}
                    >
                      {r.rank}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-medium ${r.isUnassigned ? "italic opacity-70" : ""}`}>
                      {r.lab.name}
                    </div>
                    <div className="text-xs opacity-60">
                      {r.isUnassigned ? "—" : r.lab.country ?? "—"} · {r.units} u.
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-bold tabular-nums text-[color:var(--brand-accent)]">
                    {formatCurrency(r.totalMoney)}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                    <div
                      className={`h-full rounded-full ${rankColor(r.rank)}`}
                      style={{ width: `${Math.max(r.percentOfLeader, r.totalMoney > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums opacity-60">
                    {r.percentOfLeader}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block">
          <Table>
            <THead>
              <TR>
                <TH className="w-[56px] text-center">#</TH>
                <TH>Laboratorio</TH>
                <TH>País</TH>
                <TH className="w-[34%]">Ventas (vs líder)</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Unidades</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {displayed.length === 0 && (
                <TR>
                  <TD colSpan={7} className="py-10 text-center text-sm opacity-60">
                    {summary.hasSales
                      ? "Ningún laboratorio coincide con los filtros."
                      : "Aún no hay ventas registradas para mostrar el ranking."}
                  </TD>
                </TR>
              )}
              {displayed.map((r) => (
                <TR key={r.lab.id || "unassigned"}>
                  <TD className="text-center">
                    {r.isUnassigned ? (
                      <span className="text-xs opacity-50">—</span>
                    ) : (
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-black/70 ${rankColor(
                          r.rank,
                        )}`}
                      >
                        {r.rank}
                      </span>
                    )}
                  </TD>
                  <TD className={`font-medium ${r.isUnassigned ? "italic opacity-70" : ""}`}>{r.lab.name}</TD>
                  <TD className="text-sm opacity-70">{r.isUnassigned ? "—" : r.lab.country ?? "—"}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/5">
                        <div
                          className={`h-full rounded-full ${rankColor(r.rank)}`}
                          style={{ width: `${Math.max(r.percentOfLeader, r.totalMoney > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums opacity-60">
                        {r.percentOfLeader}%
                      </span>
                    </div>
                  </TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatCurrency(r.totalMoney)}
                  </TD>
                  <TD className="text-right tabular-nums">{r.units}</TD>
                  <TD className="pr-4">
                    {r.isUnassigned ? (
                      <span className="block text-right text-xs opacity-40">—</span>
                    ) : (
                      <RowActions
                        viewHref={`/productos?laboratory=${r.lab.id}`}
                        onEdit={() => { setError(null); setDialog({ mode: "edit", id: r.lab.id, initial: { name: r.lab.name, country: r.lab.country ?? "" } }); }}
                        onDelete={async () => {
                          const res = await deleteLaboratoryAnywhere(r.lab.id);
                          if (!res.ok) toast.error(res.error);
                          else toast.success("Laboratorio eliminado.");
                        }}
                        entityName={r.lab.name}
                      />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <CatalogFormDialog
        open={dialog !== null}
        title={dialog?.mode === "edit" ? "Editar laboratorio" : "Nuevo laboratorio"}
        fields={[{ key: "name", label: "Nombre", required: true }, { key: "country", label: "País" }]}
        initial={dialog?.initial}
        submitting={submitting}
        error={error}
        onClose={() => setDialog(null)}
        onSubmit={onSubmit}
      />
      <toast.Toast />
    </>
  );
}
