"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { AlertTriangle, CheckCircle2, Info, Lock, Printer } from "lucide-react";
import { closeCashSession } from "@/features/sales/cash-session-store";
import type { CloseChecklist } from "@/features/sales/cash-close-checklist";
import {
  RD_DENOMINATIONS,
  cashCountTotal,
  differenceLabel,
} from "@/features/sales/cash-count";
import type { ShiftDetail } from "@/features/sales/cash-session-detail";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

/**
 * Asistente de cierre de caja.
 *
 * Antes era un campo solo ("efectivo contado") y el cajero sumaba los billetes
 * con calculadora sin saber cuánto esperaba el sistema. Ahora cuenta POR
 * DENOMINACIONES (el total se suma solo), ve el esperado y la diferencia en
 * vivo con color, y nada se esconde: si hay faltante, el botón lo dice.
 *
 * El detalle del turno llega YA CALCULADO de la página (`computeShiftDetail`);
 * aquí no se recalcula nada. La API no cambió: sigue mandando solo el total
 * contado.
 */
export function CerrarCajaButton({
  sessionId,
  detail,
  checklist,
  webPendientes = 0,
}: {
  sessionId: string;
  detail: ShiftDetail;
  /** Qué queda abierto en el turno (borradores, crédito). */
  checklist: CloseChecklist;
  /** Pedidos web confirmados sin facturar (del negocio). */
  webPendientes?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [modo, setModo] = React.useState<"denominaciones" | "total">(
    "denominaciones",
  );
  // Cantidades tal como se teclean; se interpretan al sumar.
  const [cantidades, setCantidades] = React.useState<Record<number, string>>(
    {},
  );
  const [totalEscrito, setTotalEscrito] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [cerrada, setCerrada] = React.useState<{
    counted: number;
    difference: number;
  } | null>(null);
  const toast = useToast();

  const contado =
    modo === "denominaciones"
      ? cashCountTotal(
          Object.fromEntries(
            Object.entries(cantidades).map(([d, v]) => [
              d,
              Math.trunc(Number(v)),
            ]),
          ),
        )
      : parseFloat(totalEscrito.replace(",", "."));

  const contadoValido = Number.isFinite(contado) && contado >= 0;
  const diferencia = contadoValido ? contado - detail.expectedCash : null;
  const info = diferencia != null ? differenceLabel(diferencia) : null;

  const handleClose = async () => {
    if (!contadoValido) {
      toast.error("Ingresa el efectivo contado (>= 0).");
      return;
    }
    setLoading(true);
    const result = await closeCashSession(sessionId, contado);
    setLoading(false);
    if (result.ok) {
      // No se recarga a ciegas: primero el resultado y el ticket.
      setCerrada({ counted: contado, difference: contado - detail.expectedCash });
    } else {
      toast.error(result.error);
    }
  };

  const filaResumen = (etiqueta: string, monto: number, signo?: "+" | "−") => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[color:var(--brand-fg)]/70">
        {signo ? `${signo} ` : ""}
        {etiqueta}
      </span>
      <span className="tabular-nums">{formatCurrency(monto)}</span>
    </div>
  );

  const tonoClases: Record<string, string> = {
    ok: "bg-emerald-50 text-emerald-800",
    falta: "bg-red-50 text-red-700",
    sobra: "bg-amber-50 text-amber-800",
  };

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        <Lock className="h-4 w-4" />
        Cerrar caja
      </Button>

      <Modal
        open={open}
        size="lg"
        title={cerrada ? "Caja cerrada" : "Cerrar caja — cuenta el efectivo"}
        onClose={() => {
          if (cerrada) window.location.reload();
          else setOpen(false);
        }}
        footer={
          cerrada ? (
            <>
              <a
                href={`/caja/historial/${sessionId}/print`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm">
                  <Printer className="h-4 w-4" />
                  Imprimir ticket del cierre
                </Button>
              </a>
              <Button size="sm" onClick={() => window.location.reload()}>
                Listo
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant={info && info.tone !== "ok" ? "danger" : "primary"}
                onClick={() => void handleClose()}
                disabled={loading || !contadoValido}
              >
                {loading
                  ? "Cerrando…"
                  : info == null || info.tone === "ok"
                    ? "Cerrar caja"
                    : `Cerrar con ${info.tone === "falta" ? "faltante" : "sobrante"} de ${formatCurrency(Math.abs(diferencia ?? 0))}`}
              </Button>
            </>
          )
        }
      >
        {cerrada ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3">
              <CheckCircle2
                aria-hidden
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
              />
              <p className="text-sm text-emerald-900">
                La sesión quedó cerrada. Imprime el ticket y archívalo con el
                arqueo.
              </p>
            </div>
            <div className="space-y-1.5 rounded-xl border border-black/10 p-4">
              {filaResumen("Efectivo esperado", detail.expectedCash)}
              {filaResumen("Efectivo contado", cerrada.counted)}
              <div
                className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${tonoClases[differenceLabel(cerrada.difference).tone]}`}
              >
                {differenceLabel(cerrada.difference).label}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Antes de cerrar: qué quedó abierto. Las ventas cobradas ya
                quedaron finalizadas en el POS al cobrarlas; esto enseña lo
                que NO, para resolverlo o cerrarlo a conciencia. Informa,
                nunca bloquea: la decisión es del cajero. */}
            <div className="space-y-2">
              {checklist.allSettled && webPendientes === 0 ? (
                <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <CheckCircle2
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                  />
                  <span>
                    {checklist.settled === 0
                      ? "Turno sin ventas. Nada quedó abierto."
                      : `Las ${checklist.settled} venta${checklist.settled === 1 ? "" : "s"} del turno están cobradas y finalizadas. Nada quedó abierto.`}
                  </span>
                </div>
              ) : (
                <>
                  {checklist.drafts > 0 ? (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <AlertTriangle
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                      />
                      <span>
                        {checklist.drafts} venta
                        {checklist.drafts === 1 ? "" : "s"} en borrador por{" "}
                        {formatCurrency(checklist.draftsTotal)}. Revísalas en{" "}
                        <a
                          href="/ventas"
                          className="font-semibold underline underline-offset-2"
                        >
                          Ventas
                        </a>{" "}
                        antes de cerrar: a esta hora suelen ser un olvido.
                      </span>
                    </div>
                  ) : null}
                  {checklist.credit > 0 ? (
                    <div className="flex items-start gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
                      <Info
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-sky-700"
                      />
                      <span>
                        {checklist.credit} venta
                        {checklist.credit === 1 ? "" : "s"} a crédito con{" "}
                        {formatCurrency(checklist.creditTotal)} por cobrar:
                        quedan en{" "}
                        <a
                          href="/cuentas-por-cobrar"
                          className="font-semibold underline underline-offset-2"
                        >
                          Cuentas por Cobrar
                        </a>
                        . Es normal; no impiden cerrar.
                      </span>
                    </div>
                  ) : null}
                  {webPendientes > 0 ? (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <AlertTriangle
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                      />
                      <span>
                        {webPendientes} pedido{webPendientes === 1 ? "" : "s"}{" "}
                        web confirmado{webPendientes === 1 ? "" : "s"} sin
                        facturar en{" "}
                        <a
                          href="/pedidos-web"
                          className="font-semibold underline underline-offset-2"
                        >
                          Pedidos web
                        </a>
                        . Factúralo{webPendientes === 1 ? "" : "s"} hoy o quedan
                        para mañana.
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {/* Lo que el sistema espera, con la cuenta a la vista. */}
            <div className="space-y-1.5 rounded-xl bg-black/[0.03] p-4">
              {filaResumen("Apertura", detail.openingAmount)}
              {filaResumen("Ventas en efectivo", detail.salesCash, "+")}
              {detail.cashIncome > 0
                ? filaResumen("Entradas de efectivo", detail.cashIncome, "+")
                : null}
              {detail.cashWithdrawal > 0
                ? filaResumen("Salidas de efectivo", detail.cashWithdrawal, "−")
                : null}
              {detail.refundsCash > 0
                ? filaResumen(
                    "Devoluciones en efectivo",
                    detail.refundsCash,
                    "−",
                  )
                : null}
              <div className="flex items-center justify-between border-t border-black/10 pt-2 text-sm font-semibold">
                <span>Efectivo esperado en caja</span>
                <span className="tabular-nums">
                  {formatCurrency(detail.expectedCash)}
                </span>
              </div>
              {detail.salesCard > 0 || detail.salesTransfer > 0 ? (
                <p className="pt-1 text-xs text-[color:var(--brand-fg)]/50">
                  Aparte (no van en el conteo): tarjeta{" "}
                  {formatCurrency(detail.salesCard)} · transferencia{" "}
                  {formatCurrency(detail.salesTransfer)}.
                </p>
              ) : null}
            </div>

            {/* Cómo contar: por billetes (el total se suma solo) o el total. */}
            <div
              role="tablist"
              aria-label="Cómo contar"
              className="inline-flex rounded-full border border-black/10 p-0.5"
            >
              {(
                [
                  ["denominaciones", "Contar billetes"],
                  ["total", "Teclear el total"],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={modo === valor}
                  onClick={() => setModo(valor)}
                  className={`min-h-9 rounded-full px-4 text-sm font-medium transition-colors ${
                    modo === valor
                      ? "bg-[color:var(--brand-primary)] text-white"
                      : "text-[color:var(--brand-fg)]/70 hover:bg-black/5"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            {modo === "denominaciones" ? (
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {RD_DENOMINATIONS.map((denom) => {
                  const qty = Math.trunc(Number(cantidades[denom] ?? ""));
                  const sub = Number.isFinite(qty) && qty > 0 ? qty * denom : 0;
                  return (
                    <div key={denom} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
                        RD${formatNumber(denom)}
                      </span>
                      <span aria-hidden className="text-xs opacity-40">
                        ×
                      </span>
                      <Input
                        aria-label={`Cantidad de RD$${formatNumber(denom)}`}
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        placeholder="0"
                        value={cantidades[denom] ?? ""}
                        onChange={(e) =>
                          setCantidades((prev) => ({
                            ...prev,
                            [denom]: e.target.value,
                          }))
                        }
                        className="w-20 text-center"
                      />
                      <span className="min-w-0 flex-1 text-right text-sm tabular-nums text-[color:var(--brand-fg)]/60">
                        {sub > 0 ? formatCurrency(sub) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <Label htmlFor="counted-cash">Efectivo contado (RD$)</Label>
                <Input
                  id="counted-cash"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={totalEscrito}
                  onChange={(e) => setTotalEscrito(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {/* La diferencia EN VIVO: el cajero la ve antes de confirmar. */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[color:var(--brand-fg)]/50">
                  Contado
                </p>
                <p className="text-lg font-bold tabular-nums">
                  {contadoValido ? formatCurrency(contado) : "—"}
                </p>
              </div>
              {info ? (
                <span
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${tonoClases[info.tone]}`}
                >
                  {info.label}
                </span>
              ) : null}
            </div>

            <p className="text-xs opacity-60">
              Una diferencia mayor a RD$50 requerirá autorización del
              supervisor.
            </p>
          </div>
        )}
      </Modal>

      <toast.Toast />
    </>
  );
}
