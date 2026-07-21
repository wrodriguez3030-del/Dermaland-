"use client";

import * as React from "react";
import Link from "next/link";
import { RowActions } from "@/components/ui/row-actions";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  FileText,
  ShieldAlert,
  Hash,
} from "lucide-react";
import {
  mockDgiiSequences,
  mockElectronicInvoices,
} from "@/lib/mock-data/integrations";
import { useProformas } from "@/features/sales/proforma-store";
import { useCashClosings } from "@/features/sales/cash-closing-store";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";

const TIPO_LABELS: Record<string, string> = {
  "31": "Crédito Fiscal",
  "32": "Consumo",
  "33": "Nota de Débito",
  "34": "Nota de Crédito",
  "41": "Compras",
  "43": "Gastos Menores",
  "44": "Regímenes Esp.",
  "45": "Gubernamental",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  signed: "Firmado",
  submitted: "Enviado",
  in_process: "En proceso",
  accepted: "Aceptado",
  accepted_conditional: "Acept. condic.",
  rejected: "Rechazado",
  cancelled: "Anulado",
  error: "Error",
};

const STATUS_TONES: Record<
  string,
  "success" | "warning" | "info" | "danger" | "neutral"
> = {
  draft: "neutral",
  signed: "info",
  submitted: "warning",
  in_process: "warning",
  accepted: "success",
  accepted_conditional: "success",
  rejected: "danger",
  cancelled: "neutral",
  error: "danger",
};

interface Filters {
  dateFrom: string;
  dateTo: string;
  tipo: string;
  estado: string;
}

export default function DgiiReportesPage() {
  const proformas = useProformas();
  const closings = useCashClosings();

  const [filters, setFilters] = React.useState<Filters>({
    dateFrom: "",
    dateTo: "",
    tipo: "",
    estado: "",
  });

  const filtered = React.useMemo(() => {
    return mockElectronicInvoices.filter((i) => {
      const created = new Date(i.createdAt).getTime();
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom).getTime();
        if (created < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo).getTime() + 86_400_000; // inclusive
        if (created > to) return false;
      }
      if (filters.tipo && i.ecfType !== filters.tipo) return false;
      if (filters.estado && i.status !== filters.estado) return false;
      return true;
    });
  }, [filters]);

  // ─── Cálculos agregados ──────────────────────────────────────────────
  const byTipo = React.useMemo(
    () => groupBy(filtered, (i) => i.ecfType),
    [filtered],
  );
  const byEstado = React.useMemo(
    () => groupBy(filtered, (i) => i.status),
    [filtered],
  );

  const stats = {
    total: filtered.length,
    aceptados: filtered.filter((i) => i.status === "accepted").length,
    enviados: filtered.filter(
      (i) =>
        i.status === "submitted" ||
        i.status === "in_process" ||
        i.status === "accepted" ||
        i.status === "accepted_conditional",
    ).length,
    rechazados: filtered.filter((i) => i.status === "rejected").length,
    pendientes: filtered.filter(
      (i) =>
        i.status === "draft" ||
        i.status === "signed" ||
        i.status === "in_process",
    ).length,
    errores: filtered.filter((i) => i.status === "error").length,
    montoTotal: filtered.reduce((s, i) => s + i.total, 0),
    itbisTotal: filtered.reduce((s, i) => s + i.itbis, 0),
  };

  return (
    <>
      <PageHeader
        title="Reportes fiscales DGII"
        description="Comprobantes emitidos, estados, secuencias. Todo en modo mock."
        breadcrumbs={[
          { label: "DGII", href: "/dgii" },
          { label: "Reportes" },
        ]}
      />

      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Reportes en MODO MOCK. No reflejan envíos reales a DGII.
            </h3>
            <p className="mt-1 text-sm text-amber-900">
              Las cifras provienen de los datos seed más las operaciones
              hechas en este navegador (proformas / cierres demo). Cuando
              el módulo DGII real esté activo, esta página leerá de la base
              de datos persistida con e-CFs efectivamente enviados.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Filtros ─── */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterInput
              label="Desde"
              type="date"
              value={filters.dateFrom}
              onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
            />
            <FilterInput
              label="Hasta"
              type="date"
              value={filters.dateTo}
              onChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
            />
            <FilterSelect
              label="Tipo e-CF"
              value={filters.tipo}
              onChange={(v) => setFilters((f) => ({ ...f, tipo: v }))}
              options={[
                { value: "", label: "Todos" },
                ...Object.entries(TIPO_LABELS).map(([v, l]) => ({
                  value: v,
                  label: `${v} · ${l}`,
                })),
              ]}
            />
            <FilterSelect
              label="Estado DGII"
              value={filters.estado}
              onChange={(v) => setFilters((f) => ({ ...f, estado: v }))}
              options={[
                { value: "", label: "Todos" },
                ...Object.entries(STATUS_LABELS).map(([v, l]) => ({
                  value: v,
                  label: l,
                })),
              ]}
            />
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  setFilters({
                    dateFrom: "",
                    dateTo: "",
                    tipo: "",
                    estado: "",
                  })
                }
              >
                Limpiar filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Stats ─── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Comprobantes (filtro)"
          value={stats.total}
          icon={FileText}
        />
        <StatCard
          label="Aceptados"
          value={stats.aceptados}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Rechazados"
          value={stats.rechazados}
          icon={ShieldAlert}
          tone="danger"
        />
        <StatCard
          label="Pendientes"
          value={stats.pendientes}
          icon={FileCheck}
          tone="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── Comprobantes por tipo ─── */}
        <Card>
          <CardHeader>
            <CardTitle>Por tipo e-CF</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Tipo</TH>
                  <TH>Descripción</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH className="text-right">Monto total</TH>
                  <TH className="text-right">ITBIS</TH>
                </TR>
              </THead>
              <TBody>
                {Object.entries(byTipo)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([tipo, list]) => (
                    <TR key={tipo}>
                      <TD className="font-mono text-xs">{tipo}</TD>
                      <TD className="text-sm">
                        {TIPO_LABELS[tipo] ?? "—"}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {list.length}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {formatCurrency(
                          list.reduce((s, i) => s + i.total, 0),
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {formatCurrency(
                          list.reduce((s, i) => s + i.itbis, 0),
                        )}
                      </TD>
                    </TR>
                  ))}
                {Object.keys(byTipo).length === 0 && (
                  <TR>
                    <TD colSpan={5} className="py-6 text-center opacity-60">
                      Sin datos para el filtro actual.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        {/* ─── Comprobantes por estado ─── */}
        <Card>
          <CardHeader>
            <CardTitle>Por estado DGII</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Estado</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH className="text-right">Monto total</TH>
                </TR>
              </THead>
              <TBody>
                {Object.entries(byEstado)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([estado, list]) => (
                    <TR key={estado}>
                      <TD>
                        <Badge tone={STATUS_TONES[estado] ?? "neutral"}>
                          {STATUS_LABELS[estado] ?? estado}
                        </Badge>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {list.length}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {formatCurrency(
                          list.reduce((s, i) => s + i.total, 0),
                        )}
                      </TD>
                    </TR>
                  ))}
                {Object.keys(byEstado).length === 0 && (
                  <TR>
                    <TD colSpan={3} className="py-6 text-center opacity-60">
                      Sin datos para el filtro actual.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ─── Secuencias e-NCF ─── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-4 w-4" /> Secuencias e-NCF (mock)
          </CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Rangos autorizados por DGII. En modo mock — no se consumen
            secuencias reales.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Tipo</TH>
                <TH>Etiqueta</TH>
                <TH className="text-right">Inicio</TH>
                <TH className="text-right">Fin</TH>
                <TH className="text-right">Próximo</TH>
                <TH className="text-right">Usadas</TH>
                <TH className="text-right">Disponibles</TH>
                <TH>Vence</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {mockDgiiSequences.map((s) => {
                const usadas = s.nextNumber - s.rangeStart;
                const remaining = s.rangeEnd - s.nextNumber + 1;
                return (
                  <TR key={s.type}>
                    <TD className="font-mono text-xs">{s.type}</TD>
                    <TD className="text-sm">{s.label}</TD>
                    <TD className="text-right tabular-nums">{s.rangeStart}</TD>
                    <TD className="text-right tabular-nums">{s.rangeEnd}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {s.nextNumber}
                    </TD>
                    <TD className="text-right tabular-nums">{usadas}</TD>
                    <TD
                      className={`text-right tabular-nums ${
                        remaining < 100 ? "text-rose-700 font-bold" : ""
                      }`}
                    >
                      {remaining}
                    </TD>
                    <TD className="text-xs">{formatDate(s.expiresAt)}</TD>
                    <TD>
                      <Badge
                        tone={
                          s.status === "active"
                            ? "success"
                            : s.status === "expiring"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {s.status}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Detalle del filtro actual ─── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Detalle de comprobantes ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>e-NCF</TH>
                <TH>Tipo</TH>
                <TH>Cliente</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
                <TH>TrackId</TH>
                <TH>Emitida</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">{i.ecfNumber}</TD>
                  <TD className="text-xs">{i.ecfType}</TD>
                  <TD className="text-sm">{i.customerName}</TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatCurrency(i.total)}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONES[i.status] ?? "neutral"}>
                      {STATUS_LABELS[i.status] ?? i.status}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-[10px] opacity-70">
                    {i.trackId ?? "—"}
                  </TD>
                  <TD className="text-xs">{formatDateTime(i.createdAt)}</TD>
                  <TD className="pr-4">
                    <RowActions
                      viewHref={`/dgii/facturas/${i.id}`}
                      canEdit={false}
                      canDelete={false}
                    />
                  </TD>
                </TR>
              ))}
              {filtered.length === 0 && (
                <TR>
                  <TD colSpan={8} className="py-6 text-center opacity-60">
                    Sin comprobantes para el filtro actual.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Datos locales del navegador (proformas + cierres) ─── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Datos locales del navegador (demo)</CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Las proformas emitidas desde el POS y los cierres de caja se
            guardan en este dispositivo (localStorage). En producción, se
            persisten en Supabase.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Proformas emitidas"
              value={proformas.length.toString()}
            />
            <Stat
              label="Pendientes de cierre"
              value={proformas
                .filter((p) => p.documentKind === "proforma")
                .length.toString()}
            />
            <Stat
              label="e-CF emitidos (mock)"
              value={proformas
                .filter((p) => p.documentKind === "invoice")
                .length.toString()}
            />
            <Stat
              label="Cierres realizados"
              value={closings.length.toString()}
            />
          </div>
          {closings.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold opacity-70 mb-2">
                Cierres recientes
              </h4>
              <ul className="space-y-1 text-xs">
                {closings.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center justify-between">
                    <Link
                      href={`/caja/cierre/${c.id}`}
                      className="font-mono hover:underline"
                    >
                      {c.closingNumber}
                    </Link>
                    <span className="opacity-60">
                      {formatDateTime(c.closedAt)} · {c.appliedPercentage}% ·{" "}
                      {formatCurrency(c.actualAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function groupBy<T, K extends string>(
  arr: ReadonlyArray<T>,
  key: (item: T) => K,
): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    if (!out[k]) out[k] = [];
    out[k]!.push(item);
  }
  return out;
}

function FilterInput({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider opacity-60">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-black/15 bg-white px-2 text-sm"
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider opacity-60">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-black/15 bg-white px-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/5 bg-black/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider opacity-60">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
