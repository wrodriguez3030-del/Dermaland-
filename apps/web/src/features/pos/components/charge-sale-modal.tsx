"use client";

import * as React from "react";
import {
  X,
  Banknote,
  CreditCard,
  Wallet,
  MoreHorizontal,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ReceiptText,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/format";
import { resolveAutoBilling } from "@/features/billing/auto-billing-rules";
import { useBillingSettings } from "@/features/billing/billing-settings-store";
import type { DefaultBillingType, PaymentMethod } from "@/types";
import {
  CHECKOUT_METHODS,
  type CheckoutMethod,
  type BuiltPayment,
  requiresLast4,
  allowsReference,
  last4FieldLabel,
  last4HelpText,
  sanitizeLast4,
  validateLast4,
  validateDraftPayment,
  buildPayment,
  canFinalizeCheckout,
  paymentsSummary,
  primaryPaymentMethod,
} from "../payment-validation";

const METHOD_ICONS: Record<
  CheckoutMethod,
  React.ComponentType<{ className?: string }>
> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Wallet,
  other: MoreHorizontal,
};

const METHOD_LABEL: Record<CheckoutMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro método",
};

export interface ChargeSaleResult {
  payments: BuiltPayment[];
  amountReceived: number;
  changeAmount: number;
}

interface ChargeSaleModalProps {
  open: boolean;
  onClose: () => void;
  subtotal: number;
  itbis: number;
  total: number;
  billingType: DefaultBillingType;
  onConfirm: (result: ChargeSaleResult) => void;
}

function round2(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Number(n.toFixed(2)));
}

export function ChargeSaleModal({
  open,
  onClose,
  subtotal,
  itbis,
  total,
  billingType,
  onConfirm,
}: ChargeSaleModalProps) {
  const [payments, setPayments] = React.useState<BuiltPayment[]>([]);
  const [method, setMethod] = React.useState<CheckoutMethod | null>(null);
  const [amount, setAmount] = React.useState<string>("");
  const [last4, setLast4] = React.useState<string>("");
  const [reference, setReference] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [last4Touched, setLast4Touched] = React.useState(false);
  const billingSettings = useBillingSettings();

  // Reset al abrir.
  React.useEffect(() => {
    if (open) {
      setPayments([]);
      setMethod(null);
      setAmount(round2(total));
      setLast4("");
      setReference("");
      setError(null);
      setLast4Touched(false);
    }
  }, [open, total]);

  const summary = paymentsSummary(payments, total);

  const draft = React.useMemo(
    () =>
      method === null
        ? null
        : {
            method,
            amount: Number(amount) || 0,
            last4,
            reference,
          },
    [method, amount, last4, reference],
  );

  const draftValid = draft !== null && validateDraftPayment(draft).ok;

  // Error en vivo del campo de últimos 4 (cuando aplica y ya fue tocado).
  const last4Error =
    method !== null && requiresLast4(method) && last4Touched
      ? validateLast4(last4, method).error ?? null
      : null;

  // Método primario para el documento a emitir: pagos confirmados o el borrador.
  const primaryForDoc: PaymentMethod | null =
    primaryPaymentMethod(payments) ?? method;

  const effectivePayments = draftValid
    ? [...payments, buildPayment(draft!)]
    : payments;
  const canConfirm = canFinalizeCheckout(effectivePayments);

  // Decisión de facturación CONFIG-AWARE (reglas automáticas + mixtos).
  // Refleja la Configuración de facturación: tarjeta → e-CF inmediato,
  // efectivo/transferencia → pendiente para cierre, mixto con tarjeta →
  // e-CF inmediato por la venta completa.
  const autoDecision = resolveAutoBilling({
    billingType,
    payments:
      effectivePayments.length > 0
        ? effectivePayments.map((p) => ({ method: p.method, amount: p.amount }))
        : primaryForDoc
          ? [{ method: primaryForDoc, amount: total }]
          : [],
    settings: billingSettings,
  });

  if (!open) return null;

  const selectMethod = (m: CheckoutMethod) => {
    setMethod(m);
    setLast4("");
    setReference("");
    setLast4Touched(false);
    setError(null);
    if (Number(amount) > 0) return;
    setAmount(round2(summary.balance > 0 ? summary.balance : total));
  };

  const addPayment = () => {
    if (draft === null) {
      setError("Selecciona un método de pago.");
      return;
    }
    const v = validateDraftPayment(draft);
    if (!v.ok) {
      setError(v.error ?? "Revisa los datos del pago.");
      if (requiresLast4(draft.method)) setLast4Touched(true);
      return;
    }
    const next = [...payments, buildPayment(draft)];
    setPayments(next);
    // Preparar el siguiente pago con el saldo restante.
    const restante = Math.max(0, total - next.reduce((s, p) => s + p.amount, 0));
    setMethod(null);
    setAmount(round2(restante));
    setLast4("");
    setReference("");
    setLast4Touched(false);
    setError(null);
  };

  const removePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    // Si hay un borrador a medias e inválido, exigir que se corrija.
    if (
      draft !== null &&
      !draftValid &&
      (amount.trim() !== "" || last4.trim() !== "" || reference.trim() !== "")
    ) {
      const v = validateDraftPayment(draft);
      setError(v.error ?? "Revisa el pago en curso.");
      if (requiresLast4(draft.method)) setLast4Touched(true);
      return;
    }
    const finalPayments = draftValid
      ? [...payments, buildPayment(draft!)]
      : payments;
    if (finalPayments.length === 0) {
      setError("Agrega al menos un pago.");
      return;
    }
    if (!canFinalizeCheckout(finalPayments)) {
      setError("Debes ingresar los últimos 4 números.");
      return;
    }
    const s = paymentsSummary(finalPayments, total);
    onConfirm({
      payments: finalPayments,
      amountReceived: s.paid,
      changeAmount: s.change,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cobrar venta"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between border-b border-black/5 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Cobrar venta</h2>
            <p className="mt-0.5 text-sm opacity-60">
              Selecciona el método de pago y finaliza la venta.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 opacity-60 hover:bg-black/5 hover:opacity-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body (scroll) ── */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Resumen de la venta */}
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="opacity-70">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="opacity-70">Impuestos (ITBIS)</span>
              <span className="tabular-nums">{formatCurrency(itbis)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-black/10 pt-2">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-2xl font-bold tabular-nums">
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          {/* Métodos de pago */}
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide opacity-60">
              Método de pago
            </div>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              role="radiogroup"
              aria-label="Método de pago"
            >
              {CHECKOUT_METHODS.map(({ value, label }) => {
                const Icon = METHOD_ICONS[value];
                const active = method === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectMethod(value)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-xs font-medium transition ${
                      active
                        ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)] shadow-sm"
                        : "border-black/10 bg-white text-black/60 hover:border-black/25 hover:text-black/80"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card de últimos 4 (tarjeta / transferencia) */}
          {method !== null && requiresLast4(method) && (
            <div className="rounded-xl border-2 border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/[0.06] p-4">
              <label
                htmlFor="charge-last4"
                className="block text-sm font-semibold"
              >
                {last4FieldLabel(method)}{" "}
                <span className="text-rose-600">*</span>
              </label>
              <input
                id="charge-last4"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="1234"
                value={last4}
                onChange={(e) => {
                  setLast4(sanitizeLast4(e.target.value));
                  setError(null);
                }}
                onBlur={() => setLast4Touched(true)}
                aria-label={last4FieldLabel(method)}
                aria-invalid={last4Error != null}
                className={`mt-1.5 h-11 w-40 rounded-lg border px-3 text-lg tracking-[0.4em] tabular-nums focus:outline-none focus:ring-2 ${
                  last4Error
                    ? "border-rose-400 focus:ring-rose-200"
                    : "border-black/15 focus:border-[color:var(--brand-primary)] focus:ring-[color:var(--brand-primary)]/20"
                }`}
              />
              {last4Error ? (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  {last4Error}
                </p>
              ) : (
                <p className="mt-1 text-xs opacity-60">{last4HelpText(method)}</p>
              )}
              <p className="mt-2 text-[11px] opacity-50">
                Solo se guardan los últimos 4 dígitos como referencia. No se pide
                ni almacena el número completo, CVV ni vencimiento.
              </p>
            </div>
          )}

          {/* Referencia opcional (otro método) */}
          {method !== null && allowsReference(method) && (
            <div className="rounded-xl border border-black/10 p-4">
              <label
                htmlFor="charge-reference"
                className="block text-sm font-semibold"
              >
                Referencia{" "}
                <span className="text-xs font-normal opacity-50">
                  (opcional)
                </span>
              </label>
              <input
                id="charge-reference"
                type="text"
                maxLength={60}
                placeholder="Ej. PayPal, crédito interno…"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                aria-label="Referencia"
                className="mt-1.5 h-10 w-full rounded-lg border border-black/15 px-3 text-sm focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20"
              />
              <p className="mt-1 text-xs opacity-60">
                Texto corto para identificar el pago.
              </p>
            </div>
          )}

          {/* Monto del pago en curso */}
          <div>
            <label
              htmlFor="charge-amount"
              className="block text-sm font-medium"
            >
              Monto
            </label>
            <input
              id="charge-amount"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder={formatCurrency(summary.balance || total)}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              aria-label="Monto"
              className="mt-1.5 h-11 w-full rounded-lg border border-black/15 px-3 text-base tabular-nums focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20"
            />
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPayment}
                disabled={method === null}
              >
                <Plus className="h-4 w-4" />
                Agregar pago
              </Button>
            </div>
          </div>

          {/* Lista de pagos agregados */}
          {payments.length > 0 && (
            <div className="rounded-xl border border-black/10">
              <div className="border-b border-black/5 px-3 py-2 text-[11px] font-medium uppercase tracking-wide opacity-60">
                Pagos ({payments.length})
              </div>
              <ul className="divide-y divide-black/5">
                {payments.map((p, i) => {
                  const Icon = METHOD_ICONS[p.method as CheckoutMethod] ??
                    MoreHorizontal;
                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 opacity-60" />
                        <span className="font-medium">
                          {METHOD_LABEL[p.method as CheckoutMethod] ?? p.method}
                        </span>
                        {p.last4 && (
                          <span className="font-mono text-xs opacity-60">
                            ···· {p.last4}
                          </span>
                        )}
                        {p.reference && (
                          <span className="text-xs opacity-60">
                            {p.reference}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">
                          {formatCurrency(p.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePayment(i)}
                          aria-label="Quitar pago"
                          className="text-rose-600 hover:text-rose-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Resumen Pagado / Cambio / Saldo */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-black/10 p-2">
              <div className="text-[11px] uppercase tracking-wide opacity-60">
                Pagado
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatCurrency(summary.paid)}
              </div>
            </div>
            <div className="rounded-lg border border-black/10 p-2">
              <div className="text-[11px] uppercase tracking-wide opacity-60">
                Cambio
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatCurrency(summary.change)}
              </div>
            </div>
            <div className="rounded-lg border border-black/10 p-2">
              <div className="text-[11px] uppercase tracking-wide opacity-60">
                Saldo
              </div>
              <div
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  summary.balance > 0 ? "text-amber-700" : ""
                }`}
              >
                {formatCurrency(summary.balance)}
              </div>
            </div>
          </div>

          {/* Estado + documento a emitir */}
          <div className="flex flex-wrap items-center gap-2">
            {summary.settled ? (
              <Badge tone="success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Pagado
              </Badge>
            ) : (
              <Badge tone="warning">
                <AlertTriangle className="h-3.5 w-3.5" /> Saldo pendiente
              </Badge>
            )}
            <Badge tone={autoDecision.documentKind !== "proforma" ? "purple" : "info"}>
              {autoDecision.documentKind !== "proforma" ? (
                <FileText className="h-3.5 w-3.5" />
              ) : (
                <ReceiptText className="h-3.5 w-3.5" />
              )}
              Documento a emitir: {autoDecision.label}
            </Badge>
            {autoDecision.timing === "immediate" && (
              <Badge tone="purple">
                {autoDecision.documentKind === "ecf"
                  ? "e-CF inmediato al cobrar"
                  : "Factura inmediata al cobrar"}
              </Badge>
            )}
            {autoDecision.timing === "at_closing" && (
              <Badge tone="warning">Pendiente de e-CF al cierre</Badge>
            )}
          </div>
          {autoDecision.timing !== "none" && (
            <p className="text-xs opacity-60">{autoDecision.reason}</p>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            Cobrar venta
          </Button>
        </div>
      </div>
    </div>
  );
}
