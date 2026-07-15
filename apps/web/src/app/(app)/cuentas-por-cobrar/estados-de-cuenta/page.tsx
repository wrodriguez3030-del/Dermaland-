"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Skeleton,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportPdfButton } from "@/components/reporting/export-pdf-button";
import { FileText, Wallet, CalendarClock, HandCoins } from "lucide-react";
import { AGING_LABEL, AGING_ORDER } from "@/features/receivables/aging";
import { AgingBadge, CollectModal, METHOD_LABEL, PromiseModal, usePendingReceivables } from "@/features/receivables/components";
import { arApi, fecha, money, type ClientStatement } from "@/features/receivables/receivables-client";
import type { ReportPdfSpec } from "@/lib/reports/pdf/types";

function hoyLabel(): string {
  return new Date().toLocaleDateString("es-DO");
}

function StatementContent() {
  const params = useSearchParams();
  const { rows } = usePendingReceivables();
  const [clientId, setClientId] = React.useState(params.get("cliente") ?? "");
  const [st, setSt] = React.useState<ClientStatement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [collectOpen, setCollectOpen] = React.useState(false);
  const [promiseOpen, setPromiseOpen] = React.useState(false);

  // Clientes con crédito activo (deducidos de las facturas pendientes).
  const clientes = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) if (r.customerId) m.set(r.customerId, r.customerName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const load = React.useCallback((id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    arApi
      .statement(id)
      .then(setSt)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (clientId) load(clientId);
  }, [clientId, load]);

  const pdfSpec = (): ReportPdfSpec => {
    if (!st) throw new Error("Sin estado de cuenta cargado.");
    return {
      meta: {
        title: "ESTADO DE CUENTA",
        subtitle: "Cuentas por cobrar — facturas pendientes y pagos",
        cutLabel: `Fecha de corte: ${hoyLabel()}`,
        periodLabel: "A LA FECHA",
        branchLabel: st.client.name.toUpperCase(),
        businessName: "DERMALAND",
        filtersLabel: st.client.phone ? `Tel: ${st.client.phone}` : "Sin filtros adicionales",
        generatedBy: "Sistema DermaLand",
        generatedAtLabel: new Date().toLocaleString("es-DO"),
        reportKind: "Estado de cuenta",
      },
      orientation: "auto",
      kpis: [
        { label: "Saldo total", value: st.saldoTotal, format: "currency", tone: st.saldoTotal > 0 ? "warn" : "good" },
        { label: "Facturas pendientes", value: st.invoices.length, format: "int" },
        { label: "Vencido", value: st.aging.overdueAmount, format: "currency", tone: st.aging.overdueAmount > 0 ? "bad" : "good" },
        { label: "Último pago", value: st.ultimoPago ? fecha(st.ultimoPago) : "—" },
      ],
      sections: [
        {
          title: "Facturas pendientes",
          table: {
            columns: [
              { header: "Factura", key: "number" },
              { header: "e-CF", key: "ecf" },
              { header: "Emisión", key: "issued", format: "date" },
              { header: "Vence", key: "due", format: "date" },
              { header: "Días venc.", key: "overdue", format: "int", align: "right" },
              { header: "Monto", key: "total", format: "currency", align: "right" },
              { header: "Saldo", key: "balance", format: "currency", align: "right" },
              { header: "Estado", key: "estado" },
            ],
            rows: st.invoices.map((i) => ({
              number: i.number,
              ecf: i.ecfNumber ?? "—",
              issued: i.issuedAt,
              due: i.dueDate,
              overdue: i.overdueDays,
              total: i.total,
              balance: i.balance,
              estado: AGING_LABEL[i.bucket],
            })),
            totals: { number: "TOTAL", balance: st.saldoTotal },
            emptyMessage: "Sin facturas pendientes.",
          },
        },
        {
          title: "Pagos registrados",
          table: {
            columns: [
              { header: "Fecha", key: "date", format: "datetime" },
              { header: "Factura", key: "number" },
              { header: "Método", key: "method" },
              { header: "Monto", key: "amount", format: "currency", align: "right" },
              { header: "Saldo después", key: "after", format: "currency", align: "right" },
            ],
            rows: st.payments.map((p) => ({
              date: p.createdAt,
              number: p.number,
              method: METHOD_LABEL[p.method] ?? p.method,
              amount: p.amount,
              after: p.balanceAfter,
            })),
            emptyMessage: "Sin pagos registrados por cobranza.",
          },
        },
        {
          title: "Antigüedad de saldos",
          table: {
            columns: [
              { header: "Tramo", key: "tramo" },
              { header: "Facturas", key: "count", format: "int", align: "right" },
              { header: "Monto", key: "amount", format: "currency", align: "right" },
            ],
            rows: AGING_ORDER.map((b) => ({
              tramo: AGING_LABEL[b],
              count: st.aging.count[b],
              amount: st.aging.amount[b],
            })),
          },
        },
      ],
    };
  };

  return (
    <>
      <PageHeader
        title="Estados de cuenta"
        description="Resumen por cliente: facturas, pagos, saldo y antigüedad."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Estados de cuenta" }]}
        actions={
          st ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPromiseOpen(true)}>
                <CalendarClock className="h-4 w-4" /> Promesa
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCollectOpen(true)} disabled={st.invoices.length === 0}>
                <HandCoins className="h-4 w-4" /> Cobrar
              </Button>
              <ExportPdfButton getSpec={pdfSpec} fileSlug={`Estado_Cuenta_${st.client.name.replace(/\s+/g, "_")}`} />
            </div>
          ) : undefined
        }
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <span className="text-sm font-medium">Cliente:</span>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="min-w-64">
            <option value="">— Selecciona un cliente con saldo —</option>
            {clientes.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {loading && <Skeleton className="h-64 rounded-xl" />}
      {error && <Card><CardContent className="py-6 text-sm text-rose-700">{error}</CardContent></Card>}
      {!clientId && !st && (
        <EmptyState
          icon={FileText}
          title="Selecciona un cliente"
          description="Elige un cliente para ver su estado de cuenta y exportarlo en PDF."
        />
      )}

      {st && !loading && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Saldo total" value={money(st.saldoTotal)} icon={Wallet} tone={st.saldoTotal > 0 ? "warning" : "success"} />
            <StatCard label="Facturas pendientes" value={st.invoices.length} hint={`${st.paidInvoicesCount} saldadas`} icon={FileText} />
            <StatCard label="Vencido" value={money(st.aging.overdueAmount)} icon={CalendarClock} tone={st.aging.overdueAmount > 0 ? "danger" : "default"} />
            <StatCard
              label="Crédito"
              value={st.client.creditLimit != null ? money(st.client.creditLimit) : "Sin límite"}
              hint={
                st.client.creditBlocked
                  ? "BLOQUEADO"
                  : st.client.creditDays != null
                    ? `${st.client.creditDays} días`
                    : "días por defecto"
              }
              tone={st.client.creditBlocked ? "danger" : "default"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Facturas pendientes</CardTitle></CardHeader>
              <CardContent className="p-0">
                {st.invoices.length === 0 ? (
                  <p className="px-6 pb-6 text-sm opacity-60">Sin facturas pendientes.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Factura</TH>
                          <TH>Vence</TH>
                          <TH className="text-right">Saldo</TH>
                          <TH>Estado</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {st.invoices.map((i) => (
                          <TR key={i.id}>
                            <TD className="font-mono text-xs">{i.number}</TD>
                            <TD className="text-xs">{fecha(i.dueDate)}</TD>
                            <TD className="text-right tabular-nums">{money(i.balance)}</TD>
                            <TD><AgingBadge bucket={i.bucket} /></TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Pagos registrados</CardTitle></CardHeader>
              <CardContent className="p-0">
                {st.payments.length === 0 ? (
                  <p className="px-6 pb-6 text-sm opacity-60">Sin pagos de cobranza registrados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Fecha</TH>
                          <TH>Factura</TH>
                          <TH>Método</TH>
                          <TH className="text-right">Monto</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {st.payments.slice(0, 15).map((p) => (
                          <TR key={p.id}>
                            <TD className="text-xs">{fecha(p.createdAt)}</TD>
                            <TD className="font-mono text-xs">{p.number}</TD>
                            <TD className="text-xs">{METHOD_LABEL[p.method] ?? p.method}</TD>
                            <TD className="text-right tabular-nums">{money(p.amount)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Antigüedad</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {AGING_ORDER.map((b) => (
                  <div key={b} className="flex items-center gap-2 rounded-lg border border-black/5 px-3 py-2 text-sm">
                    <Badge tone={b === "al_dia" ? "success" : b === "por_vencer" ? "warning" : "danger"}>
                      {AGING_LABEL[b]}
                    </Badge>
                    <span className="tabular-nums">{money(st.aging.amount[b])}</span>
                    <span className="text-xs opacity-50">({st.aging.count[b]})</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <CollectModal
            open={collectOpen}
            onClose={() => setCollectOpen(false)}
            invoices={st.invoices}
            onDone={() => load(clientId)}
          />
          <PromiseModal
            open={promiseOpen}
            onClose={() => setPromiseOpen(false)}
            clientId={st.client.id}
            clientName={st.client.name}
            suggestedAmount={st.saldoTotal}
            onDone={() => load(clientId)}
          />
        </>
      )}
    </>
  );
}

export default function EstadosDeCuentaPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <StatementContent />
    </React.Suspense>
  );
}
