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
import { AlertTriangle, ArrowLeft, Lock } from "lucide-react";
import { useProformas } from "@/features/sales/proforma-store";
import {
  selectProformasFifo,
  computeTargetAmount,
} from "@/features/sales/cash-closing-selection";
import {
  addCashClosing,
  generateCashClosingId,
  generateCashClosingNumber,
  type CashClosingRecord,
} from "@/features/sales/cash-closing-store";
import { getCurrentSession } from "@/lib/mock-data/sales";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

/**
 * Cierre de caja (UI mock).
 *
 * Documento DGII §16-17:
 *  - Mostrar totales por método.
 *  - Listar proformas pendientes (efectivo/transferencia).
 *  - Campo editable: % a convertir en e-CF.
 *  - Selección automática FIFO + ajuste manual.
 *  - Comentario (recomendado si % < 100).
 *  - Confirmación irreversible.
 *
 * MODO MOCK: ningún e-CF se firma con cert real, ningún XML se envía a
 * DGII, ninguna secuencia real se consume. Cada proforma seleccionada
 * gana un link a `/dgii/preview/[id]` para ver el e-CF DEMO.
 */

const DEFAULT_PERCENTAGE = 100;
const APPLIES_TO_METHODS = new Set(["cash", "transfer"]);

export default function CajaCierrePage() {
  const router = useRouter();
  const proformas = useProformas();
  const currentSession = React.useMemo(() => getCurrentSession(), []);

  const pending = React.useMemo(
    () =>
      proformas.filter((p) => {
        // Solo proformas (no las invoice ya emitidas) con método cash/transfer
        // (las card-like ya generaron e-CF directo en el POS).
        if (p.documentKind !== "proforma") return false;
        if (p.status === "converted_to_ecf" || p.status === "cancelled")
          return false;
        const method = p.payments[0]?.method;
        return method ? APPLIES_TO_METHODS.has(method) : true;
      }),
    [proformas],
  );

  const totalPending = pending.reduce((s, p) => s + p.total, 0);

  const [percentage, setPercentage] =
    React.useState<number>(DEFAULT_PERCENTAGE);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [comment, setComment] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);

  // Cuando cambia % o lista de proformas, recomputar selección FIFO sugerida.
  React.useEffect(() => {
    const target = computeTargetAmount(totalPending, percentage);
    const r = selectProformasFifo({ proformas: pending, targetAmount: target });
    setSelectedIds(new Set(r.selectedIds));
  }, [percentage, pending, totalPending]);

  const safePct = Math.min(100, Math.max(0, percentage));
  const targetAmount = computeTargetAmount(totalPending, safePct);
  const actualAmount = pending
    .filter((p) => selectedIds.has(p.id))
    .reduce((s, p) => s + p.total, 0);
  const actualCount = selectedIds.size;
  const difference = actualAmount - targetAmount;

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
      general: totalPending,
    };
  }, [pending, totalPending]);

  const requiresComment = safePct < 100 && comment.trim().length === 0;

  const handleConfirm = () => {
    if (requiresComment) return;
    if (pending.length === 0) return;

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
      proformasPending: {
        totalAmount: totalPending,
        count: pending.length,
      },
      appliedPercentage: safePct,
      targetAmount,
      actualAmount,
      selectedProformaIds: selectedList.map((p) => p.id),
      unselectedProformaIds: unselectedList.map((p) => p.id),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
      isMock: true,
    };
    addCashClosing(record);
    setConfirmed(true);
    router.push(`/caja/cierre/${record.id}`);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        breadcrumbs={[
          { label: "Caja", href: "/caja" },
          { label: "Cierre" },
        ]}
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
              Los e-CF demo se generan en runtime con cert dummy para mostrar
              cómo se vería el flujo real. <strong>El porcentaje a convertir
              y la selección de proformas son decisiones operativas que deben
              validarse con contador y con la normativa DGII vigente.</strong> El
              sistema no debe usarse para evadir obligaciones fiscales.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ─── Columna izquierda: totales + proformas ─── */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Totales del turno</CardTitle>
              <p className="mt-1 text-xs opacity-60">
                Solo se incluyen proformas con métodos elegibles para conversión
                (efectivo, transferencia).
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Efectivo" value={formatCurrency(totals.cash)} />
                <Stat
                  label="Transferencia"
                  value={formatCurrency(totals.transfer)}
                />
                <Stat label="Tarjeta" value={formatCurrency(totals.card)} />
                <Stat label="Total" value={formatCurrency(totals.general)} bold />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Proformas pendientes ({pending.length})</CardTitle>
              <p className="mt-1 text-xs opacity-60">
                Selección automática FIFO. Marca / desmarca para ajustar.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {pending.length === 0 ? (
                <div className="p-6 text-center text-sm opacity-60">
                  No hay proformas pendientes de conversión a e-CF.
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
                      .sort(
                        (a, b) =>
                          +new Date(a.createdAt) - +new Date(b.createdAt),
                      )
                      .map((p) => (
                        <TR key={p.id}>
                          <TD>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => toggleSelection(p.id)}
                              aria-label={`Seleccionar ${p.number}`}
                            />
                          </TD>
                          <TD className="font-mono text-xs">{p.number}</TD>
                          <TD className="text-sm">{p.customerName}</TD>
                          <TD className="text-xs">
                            {p.payments[0]?.method ?? "—"}
                          </TD>
                          <TD className="text-xs">
                            {formatDateTime(p.createdAt)}
                          </TD>
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

        {/* ─── Columna derecha: configuración + confirmación ─── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>% a convertir en e-CF</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <label className="block">
                  <span className="text-[11px] font-medium opacity-70">
                    Porcentaje (0-100)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={percentage}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPercentage(
                        Number.isNaN(v) ? 0 : Math.min(100, Math.max(0, v)),
                      );
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-black/15 px-3 text-right tabular-nums"
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-1">
                  {[0, 25, 50, 75, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPercentage(preset)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        percentage === preset
                          ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]"
                          : "border-black/10 opacity-70 hover:opacity-100"
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3">
                <Row label="Monto pendiente">
                  {formatCurrency(totalPending)}
                </Row>
                <Row label="Monto objetivo">
                  {formatCurrency(targetAmount)}
                </Row>
                <Row label="Monto seleccionado">
                  <span
                    className={
                      difference < 0
                        ? "text-amber-700"
                        : difference > 0
                          ? "text-blue-700"
                          : ""
                    }
                  >
                    {formatCurrency(actualAmount)}
                  </span>
                </Row>
                <Row label="Diferencia">
                  <span
                    className={
                      difference < 0
                        ? "text-amber-700"
                        : difference > 0
                          ? "text-blue-700"
                          : ""
                    }
                  >
                    {difference >= 0 ? "+" : ""}
                    {formatCurrency(difference)}
                  </span>
                </Row>
                <Row label="Proformas seleccionadas">
                  {actualCount} / {pending.length}
                </Row>
              </div>

              <div>
                <label className="block">
                  <span className="text-[11px] font-medium opacity-70">
                    Comentario {safePct < 100 && (
                      <span className="text-rose-700">
                        (requerido si % &lt; 100)
                      </span>
                    )}
                  </span>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Motivo del porcentaje aplicado, autorización admin, etc."
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              {safePct === 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                  <strong>0%:</strong> ningún e-CF se genera, pero queda
                  auditado el cierre. Validar con contador.
                </div>
              )}
              {safePct < 100 && safePct > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                  <strong>% parcial:</strong> queda auditado. Validar con
                  contador y normativa DGII.
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleConfirm}
                disabled={
                  confirmed ||
                  pending.length === 0 ||
                  requiresComment
                }
              >
                <Lock className="h-4 w-4" />
                Confirmar cierre
              </Button>

              {pending.length === 0 && (
                <p className="text-center text-[11px] opacity-60">
                  Sin proformas pendientes para cerrar.
                </p>
              )}
              {requiresComment && (
                <p className="text-center text-[11px] text-rose-700">
                  Agrega un comentario para confirmar un cierre parcial.
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
                Las proformas no sustituyen comprobantes fiscales cuando
                legalmente corresponda emitirlos. Esta pantalla no debe
                usarse para evadir obligaciones fiscales. Cualquier
                porcentaje &lt; 100% debe validarse con tu contador y la
                normativa DGII vigente.
              </p>
              <p className="mt-2">
                <Badge tone="neutral">MOCK</Badge> En producción, este cierre
                generará e-CF reales firmados con el cert oficial y
                consumirá secuencias autorizadas — fase pendiente.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider opacity-60">
        {label}
      </div>
      <div
        className={`mt-0.5 tabular-nums ${
          bold ? "text-lg font-bold" : "text-base"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
