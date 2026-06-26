"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { AlertTriangle, ArrowLeft, Lock, Settings } from "lucide-react";
import { useProformas } from "@/features/sales/proforma-store";
import {
  selectSalesForEcfClosing,
  summarizeEcfSelection,
  type EcfClosingSale,
} from "@/features/sales/cash-closing-selection";
import {
  addCashClosing,
  generateCashClosingId,
  generateCashClosingNumber,
  type CashClosingRecord,
} from "@/features/sales/cash-closing-store";
import { useBillingSettings } from "@/features/billing/billing-settings-store";
import { canEditBillingRules } from "@/features/billing/permissions";
import { getCurrentSession } from "@/lib/mock-data/sales";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

/**
 * Cierre de caja con facturación electrónica (UI mock) — documento DGII §6-8.
 *
 *  - El % de conversión a e-CF lo define ADMIN en Configuración de facturación;
 *    aquí es SOLO LECTURA. El cajero no puede modificarlo.
 *  - La tarjeta ya fue facturada electrónicamente al cobrar; el cierre solo
 *    procesa efectivo / transferencia pendientes.
 *  - Selección por facturas COMPLETAS con redondeo hacia arriba (no se divide
 *    ninguna venta). Estrategia configurable (últimas/primeras/manual).
 *  - Se guarda el % usado y la diferencia por redondeo en el cierre; cambios
 *    futuros del % no alteran este cierre.
 *
 * MODO MOCK: ningún e-CF se firma con cert real, ningún XML se envía a DGII,
 * ninguna secuencia real se consume.
 */

const APPLIES_TO_METHODS = new Set(["cash", "transfer"]);

export default function CajaCierrePage() {
  const router = useRouter();
  const proformas = useProformas();
  const settings = useBillingSettings();
  const currentSession = React.useMemo(() => getCurrentSession(), []);
  const isAdmin = canEditBillingRules(mockCurrentUser.role);

  // Solo proformas efectivo/transferencia pendientes (las tarjeta ya tienen e-CF).
  const pending = React.useMemo(
    () =>
      proformas.filter((p) => {
        if (p.documentKind !== "proforma") return false;
        if (p.status === "converted_to_ecf" || p.status === "cancelled")
          return false;
        const method = p.payments[0]?.method;
        return method ? APPLIES_TO_METHODS.has(method) : true;
      }),
    [proformas],
  );

  const sales: EcfClosingSale[] = React.useMemo(
    () => pending.map((p) => ({ id: p.id, amount: p.total, createdAt: p.createdAt })),
    [pending],
  );

  // Porcentaje GOBERNADO por ADMIN — solo lectura aquí.
  const percentage = settings.cashTransferEcfClosingEnabled
    ? settings.cashTransferEcfPercentage
    : 0;
  const strategy = settings.cashTransferSelectionStrategy;

  // Selección automática según estrategia + porcentaje.
  const autoResult = React.useMemo(
    () => selectSalesForEcfClosing({ sales, percentage, strategy }),
    [sales, percentage, strategy],
  );

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [comment, setComment] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);

  // Inicializa la selección desde la sugerencia automática.
  React.useEffect(() => {
    setSelectedIds(new Set(autoResult.selectedIds));
  }, [autoResult]);

  // Totales en vivo según la selección actual (permite ajuste manual).
  const live = React.useMemo(
    () => summarizeEcfSelection(sales, [...selectedIds], percentage),
    [sales, selectedIds, percentage],
  );

  const totals = React.useMemo(() => {
    const sumByMethod = (m: string) =>
      pending
        .filter((p) => p.payments[0]?.method === m)
        .reduce((s, p) => s + p.total, 0);
    return {
      cash: sumByMethod("cash"),
      transfer: sumByMethod("transfer"),
      card: 0,
      other: 0,
      general: live.totalEligible,
    };
  }, [pending, live.totalEligible]);

  const manualAdjust = strategy === "manual";
  const toggleSelection = (id: string) => {
    if (!manualAdjust) return; // En last/first la selección la dicta la estrategia.
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finalize = (generate: boolean) => {
    if (confirmed) return;
    const selectedList = pending.filter((p) => selectedIds.has(p.id));
    const unselectedList = pending.filter((p) => !selectedIds.has(p.id));

    const record: CashClosingRecord = {
      id: generateCashClosingId(),
      closingNumber: generateCashClosingNumber(),
      sessionId: currentSession?.id,
      cashierId: currentSession?.cashierId ?? "usr_cashier_1",
      cashierName: currentSession?.cashierName ?? "Rosa Peralta",
      closedAt: new Date().toISOString(),
      totals,
      proformasPending: { totalAmount: live.totalEligible, count: pending.length },
      appliedPercentage: percentage,
      targetAmount: live.targetAmount,
      actualAmount: generate ? live.generatedAmount : 0,
      selectedProformaIds: generate ? selectedList.map((p) => p.id) : [],
      unselectedProformaIds: generate
        ? unselectedList.map((p) => p.id)
        : pending.map((p) => p.id),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
      // ── Snapshot e-CF (inmutable) ──
      ecfPercentage: percentage,
      ecfStrategy: strategy,
      ecfTargetAmount: live.targetAmount,
      ecfGeneratedAmount: generate ? live.generatedAmount : 0,
      ecfPendingAmount: generate ? live.pendingAmount : live.totalEligible,
      ecfRoundingDifference: generate ? live.roundingDifference : 0,
      ecfGenerationStatus: generate ? "generated_mock" : "skipped",
      isMock: true,
    };
    addCashClosing(record);
    setConfirmed(true);
    router.push(`/caja/cierre/${record.id}`);
  };

  return (
    <>
      <PageHeader
        title="Cierre de caja"
        description={
          currentSession
            ? `Sesión ${currentSession.sessionNumber} · ${currentSession.cashierName}`
            : "Sin sesión abierta (mock)"
        }
        breadcrumbs={[{ label: "Caja", href: "/caja" }, { label: "Cierre" }]}
        actions={
          <Link href="/caja">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
        }
      />

      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Cierre de caja en MODO MOCK. No se envía ningún e-CF a DGII.
            </h3>
            <p className="mt-1 text-sm text-amber-900">
              Este porcentaje fue definido por administración en Configuración de
              facturación. No puede modificarse desde el cierre de caja. El
              sistema usa facturas completas y puede redondear hacia arriba para
              no dividir ventas.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Totales del turno</CardTitle>
              <p className="mt-1 text-xs opacity-60">
                Solo efectivo / transferencia pendientes. La tarjeta ya fue
                facturada electrónicamente al cobrar.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Efectivo" value={formatCurrency(totals.cash)} />
                <Stat label="Transferencia" value={formatCurrency(totals.transfer)} />
                <Stat label="Ef. + Transf." value={formatCurrency(totals.general)} />
                <Stat label="Tarjeta (ya e-CF)" value={formatCurrency(0)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventas seleccionadas ({live.selectedCount})</CardTitle>
              <p className="mt-1 text-xs opacity-60">
                {manualAdjust
                  ? "Selección manual: marca / desmarca ventas completas."
                  : `Selección automática (${
                      strategy === "last" ? "últimas ventas" : "primeras ventas"
                    }). Facturas completas, redondeo hacia arriba.`}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {pending.length === 0 ? (
                <div className="p-6 text-center text-sm opacity-60">
                  No hay ventas en efectivo/transferencia pendientes de e-CF.
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-10"></TH>
                      <TH>Proforma</TH>
                      <TH>Cliente</TH>
                      <TH>Método</TH>
                      <TH>Fecha</TH>
                      <TH className="text-right">Total</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {[...pending]
                      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
                      .map((p) => (
                        <TR key={p.id}>
                          <TD>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              disabled={!manualAdjust}
                              onChange={() => toggleSelection(p.id)}
                              aria-label={`Seleccionar ${p.number}`}
                            />
                          </TD>
                          <TD className="font-mono text-xs">{p.number}</TD>
                          <TD className="text-sm">{p.customerName}</TD>
                          <TD className="text-xs">{p.payments[0]?.method ?? "—"}</TD>
                          <TD className="text-xs">{formatDateTime(p.createdAt)}</TD>
                          <TD className="text-right tabular-nums">
                            {formatCurrency(p.total)}
                          </TD>
                        </TR>
                      ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Facturación electrónica del cierre</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-black/10 bg-black/[0.03] p-3">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-70">
                    <Lock className="h-3 w-3" /> Porcentaje (definido por admin)
                  </div>
                  <div className="mt-0.5 text-2xl font-bold tabular-nums">
                    {percentage}%
                  </div>
                </div>
                {isAdmin && (
                  <Link href="/dgii/facturacion/configuracion">
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4" /> Cambiar
                    </Button>
                  </Link>
                )}
              </div>

              <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3">
                <Row label="Total efectivo + transferencia">
                  {formatCurrency(live.totalEligible)}
                </Row>
                <Row label="Porcentaje admin">{percentage}%</Row>
                <Row label="Monto objetivo">{formatCurrency(live.targetAmount)}</Row>
                <Row label="Monto generado (facturas completas)">
                  {formatCurrency(live.generatedAmount)}
                </Row>
                <Row label="Diferencia por redondeo">
                  <span className="text-blue-700">
                    +{formatCurrency(live.roundingDifference)}
                  </span>
                </Row>
                <Row label="Pendiente sin convertir">
                  {formatCurrency(live.pendingAmount)}
                </Row>
                <Row label="Ventas seleccionadas">
                  {live.selectedCount} / {pending.length}
                </Row>
              </div>

              <p className="rounded-md border border-black/10 bg-black/[0.02] p-2 text-[11px] opacity-70">
                Diferencia mostrada como “redondeo por factura completa”. Nunca
                se divide una venta ni se altera su monto.
              </p>

              <div>
                <label className="block">
                  <span className="text-[11px] font-medium opacity-70">
                    Comentario (opcional)
                  </span>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Notas del cierre…"
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => finalize(true)}
                  disabled={confirmed || pending.length === 0}
                >
                  <Lock className="h-4 w-4" /> Generar e-CF del cierre
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => finalize(false)}
                  disabled={confirmed}
                >
                  Omitir por ahora
                </Button>
              </div>

              {pending.length === 0 && (
                <p className="text-center text-[11px] opacity-60">
                  Sin ventas pendientes para convertir.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recordatorio fiscal</CardTitle>
            </CardHeader>
            <CardContent className="text-xs opacity-80">
              <p>
                El porcentaje y la estrategia se definen en{" "}
                <Link
                  href="/dgii/facturacion/configuracion"
                  className="text-[color:var(--brand-accent)] underline"
                >
                  Configuración de facturación
                </Link>{" "}
                (solo ADMIN). Esta pantalla no debe usarse para evadir
                obligaciones fiscales.
              </p>
              <p className="mt-2">
                <Badge tone="neutral">MOCK</Badge> En producción este cierre
                generará e-CF reales firmados con el cert oficial y consumirá
                secuencias autorizadas — fase pendiente.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider opacity-60">{label}</div>
      <div className="mt-0.5 text-base tabular-nums">{value}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
