import type { PaymentMethod } from "@/types";

/**
 * Lógica pura del cobro POS (modal "Cobrar venta").
 *
 * Captura de pago administrativa — NO procesa tarjetas reales:
 *  - Tarjeta / Transferencia: se exige y guarda SOLO los últimos 4 dígitos
 *    (`last4`) como referencia. Nunca el número completo, CVV, vencimiento ni
 *    nombre del tarjetahabiente.
 *  - Otro método: referencia de texto corta opcional.
 *  - Efectivo: solo monto.
 *
 * Soporta múltiples pagos por venta (pago dividido): cada pago guarda su
 * propio método, monto y referencia/últimos 4.
 *
 * Este módulo es independiente de React para poder testearlo en entorno node.
 */

/** Métodos ofrecidos en el modal de cobro. */
export type CheckoutMethod = "cash" | "card" | "transfer" | "other";

export const CHECKOUT_METHODS: ReadonlyArray<{
  value: CheckoutMethod;
  label: string;
  description: string;
}> = [
  { value: "cash", label: "Efectivo", description: "DOP en mano" },
  { value: "card", label: "Tarjeta", description: "Crédito / débito" },
  { value: "transfer", label: "Transferencia", description: "Bancaria / app" },
  { value: "other", label: "Otro método", description: "PayPal, crédito interno…" },
];

/** Tarjeta y Transferencia exigen los últimos 4 dígitos. */
export function requiresLast4(method: CheckoutMethod): boolean {
  return method === "card" || method === "transfer";
}

/** "Otro método" admite una referencia de texto opcional. */
export function allowsReference(method: CheckoutMethod): boolean {
  return method === "other";
}

/** Etiqueta del campo de últimos 4 según el método. */
export function last4FieldLabel(method: CheckoutMethod): string {
  return method === "transfer"
    ? "Últimos 4 números de la referencia"
    : "Últimos 4 números";
}

/** Texto de ayuda del campo de últimos 4 según el método. */
export function last4HelpText(method: CheckoutMethod): string {
  return method === "transfer"
    ? "Ingresa los últimos 4 dígitos de la referencia o comprobante de transferencia."
    : "Ingresa los últimos 4 dígitos de la tarjeta.";
}

/** Deja solo dígitos y conserva como máximo los ÚLTIMOS 4 (descarta el resto). */
export function sanitizeLast4(raw: string): string {
  return (raw ?? "").replace(/\D/g, "").slice(-4);
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Valida los últimos 4 dígitos para el método dado.
 * Para métodos que no lo requieren (efectivo / otro) siempre es válido.
 * Orden de mensajes según especificación de negocio.
 */
export function validateLast4(
  raw: string,
  method: CheckoutMethod,
): ValidationResult {
  if (!requiresLast4(method)) return { ok: true };

  const value = (raw ?? "").trim();
  if (value.length === 0) {
    return { ok: false, error: "Debes ingresar los últimos 4 números." };
  }
  if (/\D/.test(value)) {
    return { ok: false, error: "Solo se permiten números." };
  }
  if (value.length !== 4) {
    return { ok: false, error: "Debe tener exactamente 4 dígitos." };
  }
  return { ok: true };
}

/** Borrador de un pago que el cajero está capturando en el modal. */
export interface DraftPayment {
  method: CheckoutMethod;
  amount: number;
  /** Solo relevante para tarjeta / transferencia. */
  last4?: string;
  /** Solo relevante para "otro método". */
  reference?: string;
}

/**
 * Pago ya construido y listo para persistir. Mapea 1:1 a `PaymentMethod`.
 * NOTA DE SEGURIDAD: solo guarda `last4` (4 dígitos), nunca el PAN completo.
 */
export interface BuiltPayment {
  method: PaymentMethod;
  amount: number;
  last4?: string;
  reference?: string;
}

/** Valida un borrador de pago antes de agregarlo a la lista. */
export function validateDraftPayment(draft: DraftPayment): ValidationResult {
  if (!(typeof draft.amount === "number") || !(draft.amount > 0)) {
    return { ok: false, error: "Ingresa un monto mayor a 0." };
  }
  return validateLast4(draft.last4 ?? "", draft.method);
}

/**
 * Construye el pago a persistir desde el borrador.
 * Solo conserva `last4` (sanitizado a 4 dígitos) o `reference` corta; nunca
 * datos sensibles de tarjeta.
 */
export function buildPayment(draft: DraftPayment): BuiltPayment {
  const built: BuiltPayment = {
    method: draft.method,
    amount: draft.amount,
  };
  if (requiresLast4(draft.method)) {
    built.last4 = sanitizeLast4(draft.last4 ?? "");
  } else if (allowsReference(draft.method)) {
    const ref = (draft.reference ?? "").trim().slice(0, 60);
    if (ref) built.reference = ref;
  }
  return built;
}

/** ¿Algún pago de tarjeta/transferencia quedó sin sus 4 dígitos válidos? */
export function checkoutHasUnresolvedLast4(
  payments: ReadonlyArray<BuiltPayment>,
): boolean {
  return payments.some(
    (p) =>
      (p.method === "card" || p.method === "transfer") &&
      !(p.last4 != null && /^\d{4}$/.test(p.last4)),
  );
}

/**
 * El cobro puede completarse si hay al menos un pago y todos los pagos de
 * tarjeta/transferencia tienen sus últimos 4 dígitos válidos.
 */
export function canFinalizeCheckout(
  payments: ReadonlyArray<BuiltPayment>,
): boolean {
  return payments.length > 0 && !checkoutHasUnresolvedLast4(payments);
}

export interface PaymentsSummary {
  paid: number;
  balance: number;
  change: number;
  /** `true` cuando lo pagado cubre el total. */
  settled: boolean;
}

/** Resumen Pagado / Cambio / Saldo a partir de los pagos y el total. */
export function paymentsSummary(
  payments: ReadonlyArray<BuiltPayment>,
  total: number,
): PaymentsSummary {
  const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const balance = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const settled = paid + 0.0001 >= total;
  return { paid, balance, change, settled };
}

/**
 * Métodos equivalentes a "tarjeta" para efectos del documento fiscal a emitir.
 * Igual que en `document-resolver` para mantener coherencia.
 */
const CARD_LIKE: ReadonlyArray<PaymentMethod> = [
  "card",
  "azul",
  "cardnet",
  "visanet",
];

/**
 * Método "primario" de la venta para resolver el documento a emitir en pagos
 * divididos: si hay algún pago tipo tarjeta se prioriza (dispara factura e-CF
 * de consumo); si no, gana el pago de mayor monto. Mantiene el comportamiento
 * de pago único intacto.
 */
export function primaryPaymentMethod(
  payments: ReadonlyArray<BuiltPayment>,
): PaymentMethod | null {
  if (payments.length === 0) return null;
  const cardLike = payments.find((p) => CARD_LIKE.includes(p.method));
  if (cardLike) return cardLike.method;
  return [...payments].sort((a, b) => b.amount - a.amount)[0]!.method;
}
