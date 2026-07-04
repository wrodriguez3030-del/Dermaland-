"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { FilterBar } from "@/components/ui/filter-bar";
import { RowActions } from "@/components/ui/row-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Gift, Plus, Coins, Clock, CheckCircle2, Power } from "lucide-react";
import {
  useIncentiveRules,
  useIncentives,
  deleteIncentiveRule,
  saveIncentiveRule,
  payIncentives,
  RULE_TYPE_LABEL,
  STATUS_LABEL,
  INCENTIVE_BACKEND,
  type IncentiveRuleRecord,
  type IncentiveStatus,
} from "@/features/incentives/incentive-store";
import { IncentiveRuleModal } from "@/features/incentives/components/rule-modal";
import { formatCurrency, formatDate } from "@/lib/utils/format";

const STATUS_TONE: Record<IncentiveStatus, "warning" | "info" | "success" | "neutral"> = {
  pending: "warning",
  approved: "info",
  paid: "success",
  void: "neutral",
};

export default function IncentivosPage() {
  const toast = useToast();
  const { rules, loading: rulesLoading } = useIncentiveRules();
  const [sellerFilter, setSellerFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<IncentiveStatus | "all">("all");
  const { incentives, loading: incLoading } = useIncentives({
    sellerId: sellerFilter || undefined,
    status: statusFilter,
  });
  const [modal, setModal] = React.useState<{ open: boolean; rule?: IncentiveRuleRecord | null }>({
    open: false,
  });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [paying, setPaying] = React.useState(false);

  // KPIs desde los incentivos cargados.
  const kpis = React.useMemo(() => {
    let generated = 0,
      pending = 0,
      paid = 0;
    for (const i of incentives) {
      generated += i.incentiveAmount;
      if (i.status === "pending" || i.status === "approved") pending += i.incentiveAmount;
      if (i.status === "paid") paid += i.incentiveAmount;
    }
    return { generated, pending, paid };
  }, [incentives]);

  // Vendedores presentes (para el filtro).
  const sellerOptions = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const i of incentives) if (i.sellerId) m.set(i.sellerId, i.sellerName || "Vendedor");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [incentives]);

  const payableSelected = incentives.filter(
    (i) => selected.has(i.id) && (i.status === "pending" || i.status === "approved"),
  );

  const togglePreferred = async (r: IncentiveRuleRecord) => {
    await saveIncentiveRule({ active: !r.active }, r.id);
  };

  const handlePay = async () => {
    if (payableSelected.length === 0) return;
    setPaying(true);
    const res = await payIncentives(payableSelected.map((i) => i.id));
    setPaying(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo registrar el pago.");
      return;
    }
    toast.success(`${payableSelected.length} incentivo(s) marcados como pagados.`);
    setSelected(new Set());
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Incentivos de ventas"
        description="Comisiones por vendedor: reglas configurables e incentivos generados al pagar cada venta."
        breadcrumbs={[{ label: "Ventas" }, { label: "Incentivos" }]}
        actions={
          <Button size="sm" onClick={() => setModal({ open: true, rule: null })}>
            <Plus className="h-4 w-4" /> Nueva regla
          </Button>
        }
      />

      {INCENTIVE_BACKEND !== "supabase" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Modo demo local: las reglas se guardan en este navegador. Con Supabase
          activo, los incentivos se generan automáticamente al pagar cada venta.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Incentivos generados" value={formatCurrency(kpis.generated)} icon={Coins} tone="primary" />
        <StatCard label="Pendientes" value={formatCurrency(kpis.pending)} icon={Clock} tone="warning" />
        <StatCard label="Pagados" value={formatCurrency(kpis.paid)} icon={CheckCircle2} tone="success" />
        <StatCard label="Reglas activas" value={rules.filter((r) => r.active).length} icon={Gift} />
      </div>

      {/* ── Reglas ── */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <h2 className="text-sm font-semibold">Reglas de incentivo</h2>
          </div>
          {rulesLoading ? (
            <p className="p-6 text-center text-sm opacity-60">Cargando reglas…</p>
          ) : rules.length === 0 ? (
            <EmptyState
              icon={Gift}
              title="Sin reglas de incentivo"
              description="Crea una regla para empezar a generar comisiones por vendedor."
              action={
                <Button size="sm" onClick={() => setModal({ open: true, rule: null })}>
                  <Plus className="h-4 w-4" /> Nueva regla
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Nombre</TH>
                  <TH>Tipo</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Vigencia</TH>
                  <TH>Estado</TH>
                  <TH className="text-right pr-4">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {rules.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.name}</TD>
                    <TD className="text-sm">{RULE_TYPE_LABEL[r.ruleType]}</TD>
                    <TD className="text-right tabular-nums text-sm">
                      {r.percentage != null ? `${r.percentage}%` : ""}
                      {r.percentage != null && r.fixedAmount != null ? " / " : ""}
                      {r.fixedAmount != null ? formatCurrency(r.fixedAmount) : ""}
                    </TD>
                    <TD className="text-xs opacity-70">
                      {r.startsAt ? formatDate(r.startsAt) : "—"}
                      {" → "}
                      {r.endsAt ? formatDate(r.endsAt) : "sin fin"}
                    </TD>
                    <TD>
                      {r.active ? (
                        <Badge tone="success">Activa</Badge>
                      ) : (
                        <Badge tone="neutral">Inactiva</Badge>
                      )}
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        onEdit={() => setModal({ open: true, rule: r })}
                        onDelete={async () => {
                          const res = await deleteIncentiveRule(r.id);
                          if (!res.ok) toast.error(res.error);
                          else toast.success("Regla eliminada.");
                        }}
                        entityName={r.name}
                        customActions={[
                          {
                            label: r.active ? "Desactivar" : "Activar",
                            icon: Power,
                            onClick: () => togglePreferred(r),
                          },
                        ]}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Incentivos generados ── */}
      <FilterBar className="mb-4">
        <Select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}>
          <option value="">Todos los vendedores</option>
          {sellerOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as IncentiveStatus | "all")}
        >
          <option value="all">Todos los estados</option>
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobados</option>
          <option value="paid">Pagados</option>
        </Select>
        {payableSelected.length > 0 && (
          <Button size="sm" onClick={handlePay} disabled={paying}>
            <CheckCircle2 className="h-4 w-4" />
            {paying
              ? "Registrando…"
              : `Marcar ${payableSelected.length} como pagado(s)`}
          </Button>
        )}
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {incLoading ? (
            <p className="p-6 text-center text-sm opacity-60">Cargando incentivos…</p>
          ) : incentives.length === 0 ? (
            <p className="p-8 text-center text-sm opacity-60">
              {INCENTIVE_BACKEND === "supabase"
                ? "Aún no hay incentivos generados. Se crean automáticamente al pagar ventas con vendedor y reglas activas."
                : "Los incentivos generados aparecen con Supabase activo."}
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-8"></TH>
                  <TH>Fecha</TH>
                  <TH>Factura</TH>
                  <TH>Vendedor</TH>
                  <TH>Regla</TH>
                  <TH className="text-right">Base</TH>
                  <TH className="text-right">Incentivo</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {incentives.map((i) => {
                  const selectable = i.status === "pending" || i.status === "approved";
                  return (
                    <TR key={i.id}>
                      <TD>
                        {selectable && (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selected.has(i.id)}
                            onChange={() => toggle(i.id)}
                            aria-label="Seleccionar incentivo"
                          />
                        )}
                      </TD>
                      <TD className="text-xs">{formatDate(i.earnedAt)}</TD>
                      <TD className="font-mono text-xs">{i.saleNumber ?? "—"}</TD>
                      <TD className="text-sm">{i.sellerName ?? "—"}</TD>
                      <TD className="text-sm">{i.ruleName ?? "—"}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(i.baseAmount)}</TD>
                      <TD className="text-right tabular-nums font-medium">
                        {formatCurrency(i.incentiveAmount)}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <IncentiveRuleModal
        open={modal.open}
        rule={modal.rule}
        onClose={() => setModal({ open: false })}
      />
      <toast.Toast />
    </>
  );
}
