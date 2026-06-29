import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import type { ShiftDetail } from "@/features/sales/cash-session-detail";

/**
 * "Detalles del turno en curso" — vista de caja para cajero/admin.
 *
 * Presentación pura (sin estado): recibe el detalle ya calculado
 * (`computeShiftDetail`). El dinero esperado en caja cuenta SOLO efectivo real;
 * tarjeta y transferencia se muestran como ventas pero no afectan el efectivo.
 */
export function ShiftDetailView({ detail }: { detail: ShiftDetail }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Detalles del turno en curso
        </h2>
        <p className="text-sm opacity-60">
          Conoce los movimientos de efectivo en tu turno de caja actual.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Card principal — fecha inicio, total ventas y detalle de movimientos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide opacity-50">
                  Fecha de inicio
                </p>
                <p className="text-sm font-medium">
                  {formatDateTime(detail.openedAt)}
                </p>
                <p className="mt-1 text-xs opacity-60">
                  {detail.cashierName}
                  {detail.branchName ? ` · ${detail.branchName}` : ""} ·{" "}
                  {detail.sessionNumber}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide opacity-50">
                  Total de ventas
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatCurrency(detail.totalSales)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-black/5 text-sm">
            <DetailRow label="Base inicial" value={detail.openingAmount} />
            <DetailRow label="Ventas en efectivo" value={detail.salesCash} />
            <DetailRow label="Ventas por tarjeta" value={detail.salesCard} />
            <DetailRow
              label="Ventas por transferencia"
              value={detail.salesTransfer}
            />
            {detail.salesOther > 0 && (
              <DetailRow label="Otros métodos" value={detail.salesOther} />
            )}
            <DetailRow
              label="Devolución de dinero"
              value={detail.refundsCash}
              negative
            />
            <DetailRow label="Ingresos en efectivo" value={detail.cashIncome} />
            <DetailRow
              label="Retiros de efectivo"
              value={detail.cashWithdrawal}
              negative
            />
            <div className="flex items-center justify-between pt-3 font-semibold">
              <span>Total de movimientos del turno</span>
              <span className="tabular-nums">
                {formatCurrency(detail.totalShiftMovements)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card secundaria — dinero esperado en caja */}
        <Card className="bg-[color:var(--brand-accent)]/5">
          <CardHeader>
            <CardTitle>Dinero esperado en caja</CardTitle>
            <p className="mt-1 text-xs opacity-60">
              Base inicial más las ventas e ingresos en efectivo, menos las
              devoluciones y retiros.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-bold tabular-nums text-[color:var(--brand-accent)]">
              {formatCurrency(detail.expectedCash)}
            </p>
            {detail.countedCash != null && (
              <div className="space-y-1 border-t border-black/5 pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="opacity-70">Efectivo contado</span>
                  <span className="tabular-nums">
                    {formatCurrency(detail.countedCash)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Diferencia</span>
                  <span
                    className={`tabular-nums ${
                      (detail.difference ?? 0) < 0
                        ? "text-rose-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {formatCurrency(detail.difference ?? 0)}
                  </span>
                </div>
              </div>
            )}
            <p className="text-[11px] opacity-50">
              La tarjeta y la transferencia se registran como ventas pero no
              aumentan el efectivo físico esperado en caja.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">
        {negative && value > 0 ? "-" : ""}
        {formatCurrency(value)}
      </span>
    </div>
  );
}
