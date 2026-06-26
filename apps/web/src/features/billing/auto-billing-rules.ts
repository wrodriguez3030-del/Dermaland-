import type { DefaultBillingType, PaymentMethod } from "@/types";
import type { BillingSettings } from "./billing-settings-store";

/**
 * Motor de reglas automáticas de facturación (config-aware).
 *
 * Extiende `resolveDocumentToIssue` (features/sales/document-resolver.ts)
 * teniendo en cuenta la Configuración de facturación del negocio:
 *  - Modo de uso manual vs automático.
 *  - Tarjeta → e-CF inmediato (si `cardEcfImmediateEnabled`).
 *  - Efectivo / transferencia → pendiente para el cierre de caja
 *    (si `cashTransferEcfClosingEnabled`).
 *  - Pago mixto que incluye tarjeta → e-CF inmediato por la venta completa
 *    (nunca se divide el comprobante).
 *  - Proforma nunca consume secuencia fiscal real ni genera e-CF real.
 *  - Tipo automático: E32 consumo / E31 crédito fiscal (RNC).
 *
 * Esta función es PURA y no toca DGII. La emisión real está bloqueada aguas
 * abajo por `realEmissionEnabled` + ambiente + killswitch de env.
 */

export type CardLikeMethod = "card" | "azul" | "cardnet" | "visanet";

/** Métodos equivalentes a "tarjeta" para efectos de e-CF inmediato. */
export const CARD_LIKE_METHODS: ReadonlyArray<PaymentMethod> = [
  "card",
  "azul",
  "cardnet",
  "visanet",
];

export function isCardLike(method: PaymentMethod | null | undefined): boolean {
  return method != null && CARD_LIKE_METHODS.includes(method);
}

/** Una porción de un pago (para pagos mixtos). */
export interface PaymentSlice {
  method: PaymentMethod;
  amount: number;
}

export type BillingTiming = "immediate" | "at_closing" | "none";
export type BillingDocumentKind = "proforma" | "ncf" | "ecf";

export interface AutoBillingDecision {
  /** Documento que corresponde emitir. */
  documentKind: BillingDocumentKind;
  /** Tipo e-CF cuando aplica (31/32) o tipo NCF (B01/B02). */
  comprobanteType: "E31" | "E32" | "B01" | "B02" | "PROFORMA";
  /** Cuándo se factura electrónicamente. */
  timing: BillingTiming;
  /** ¿Esta venta queda pendiente para el cierre de caja? */
  pendingForClosing: boolean;
  /** ¿Consume secuencia fiscal real? (proforma => false). */
  consumesFiscalSequence: boolean;
  /** Etiqueta corta para chips/UI. */
  label: string;
  /** Explicación legible de por qué se decidió así. */
  reason: string;
}

export interface ResolveAutoBillingInput {
  billingType: DefaultBillingType;
  /** Método único (POS simple). Ignorado si se pasa `payments`. */
  paymentMethod?: PaymentMethod | null;
  /** Desglose de pagos (para mixtos). Si está presente, manda sobre paymentMethod. */
  payments?: ReadonlyArray<PaymentSlice>;
  settings: BillingSettings;
  /** Override manual del usuario cuando `usageMode === "manual"`. */
  manualChoice?: BillingDocumentKind;
}

function hasCard(payments: ReadonlyArray<PaymentSlice>): boolean {
  return payments.some((p) => isCardLike(p.method));
}

function onlyCashOrTransfer(payments: ReadonlyArray<PaymentSlice>): boolean {
  return payments.every(
    (p) => p.method === "cash" || p.method === "transfer",
  );
}

/**
 * Decide e-CF/NCF/proforma para una venta según método(s) de pago + config.
 * Modo manual: respeta `manualChoice` (salvo crédito fiscal, que siempre exige
 * comprobante fiscal de crédito).
 */
export function resolveAutoBilling(
  input: ResolveAutoBillingInput,
): AutoBillingDecision {
  const { billingType, settings } = input;
  const payments: PaymentSlice[] = input.payments
    ? [...input.payments]
    : input.paymentMethod
      ? [{ method: input.paymentMethod, amount: 0 }]
      : [];

  const ecfEnabled =
    settings.defaultBillingMode === "ecf" || settings.defaultBillingMode === "both";
  const consumerType = ecfEnabled ? settings.defaultConsumerEcfType : "B02";
  const rncType = ecfEnabled ? settings.defaultRncEcfType : "B01";

  // ── Crédito fiscal: siempre comprobante de crédito, sin importar el pago. ──
  if (billingType === "credito_fiscal") {
    const kind: BillingDocumentKind = ecfEnabled ? "ecf" : "ncf";
    return {
      documentKind: kind,
      comprobanteType: rncType,
      timing: "immediate",
      pendingForClosing: false,
      consumesFiscalSequence: true,
      label: rncType === "E31" ? "Factura e-CF Crédito Fiscal" : "Factura NCF Crédito Fiscal (B01)",
      reason:
        "Cliente con crédito fiscal: siempre se emite comprobante de crédito al cobrar.",
    };
  }

  // ── Modo manual: el usuario eligió explícitamente. ──
  if (settings.usageMode === "manual" && input.manualChoice) {
    if (input.manualChoice === "proforma") {
      return proformaDecision("El usuario eligió Proforma (modo manual).");
    }
    const kind = input.manualChoice;
    const type = kind === "ecf" ? consumerType : "B02";
    return {
      documentKind: kind,
      comprobanteType: type,
      timing: "immediate",
      pendingForClosing: false,
      consumesFiscalSequence: true,
      label: kind === "ecf" ? "Factura e-CF Consumo" : "Factura NCF Consumo (B02)",
      reason: "El usuario eligió el tipo de comprobante (modo manual).",
    };
  }

  // ── Automático (consumo) ──
  const includesCard = payments.length > 0 && hasCard(payments);
  const cashTransferOnly =
    payments.length > 0 && onlyCashOrTransfer(payments);

  // Mixto con tarjeta: e-CF inmediato por la venta completa (no se divide).
  if (includesCard && settings.cardEcfImmediateEnabled) {
    return {
      documentKind: ecfEnabled ? "ecf" : "ncf",
      comprobanteType: consumerType,
      timing: "immediate",
      pendingForClosing: false,
      consumesFiscalSequence: true,
      label: ecfEnabled ? "Factura e-CF Consumo" : "Factura NCF Consumo (B02)",
      reason: payments.length > 1
        ? "Pago mixto incluye tarjeta: e-CF inmediato por la venta completa (no se divide el comprobante)."
        : "Pago con tarjeta: e-CF inmediato al cobrar.",
    };
  }

  // Efectivo / transferencia: pendiente para el cierre (si la regla está activa).
  if (cashTransferOnly && settings.cashTransferEcfClosingEnabled) {
    return {
      documentKind: "proforma",
      comprobanteType: "PROFORMA",
      timing: "at_closing",
      pendingForClosing: true,
      consumesFiscalSequence: false,
      label: "Proforma · pendiente para cierre",
      reason:
        "Efectivo/transferencia: se registra como venta normal y queda pendiente para conversión a e-CF en el cierre de caja, según el porcentaje definido por administración.",
    };
  }

  // Tarjeta con regla desactivada, u otros métodos → proforma (sin obligatoriedad).
  if (includesCard && !settings.cardEcfImmediateEnabled) {
    return proformaDecision(
      "Regla de tarjeta inmediata desactivada: se permite facturación manual según permisos.",
    );
  }

  return proformaDecision(
    "Sin método elegible para e-CF automático: se emite proforma (no fiscal).",
  );
}

function proformaDecision(reason: string): AutoBillingDecision {
  return {
    documentKind: "proforma",
    comprobanteType: "PROFORMA",
    timing: "none",
    pendingForClosing: false,
    consumesFiscalSequence: false,
    label: "Proforma",
    reason,
  };
}

// ─── Resumen de reglas (para la pantalla "Reglas automáticas de e-CF") ──────────

export interface BillingRuleSummary {
  id: string;
  title: string;
  detail: string;
  enabled: boolean;
  badge: "ecf_immediate" | "at_closing" | "proforma";
}

/** Construye el resumen legible de reglas activas a partir de la config. */
export function summarizeBillingRules(
  settings: BillingSettings,
): BillingRuleSummary[] {
  return [
    {
      id: "card",
      title: "Pagos con tarjeta",
      detail:
        "Generar e-CF inmediatamente al cobrar. E32 si consumidor final, E31 si cliente con RNC/crédito fiscal. Si la regla se desactiva, se permite facturación manual según permisos.",
      enabled: settings.cardEcfImmediateEnabled,
      badge: "ecf_immediate",
    },
    {
      id: "cash",
      title: "Pagos en efectivo",
      detail:
        "Registrar venta normal. No se genera e-CF obligatorio al momento. Queda pendiente para el cierre de caja.",
      enabled: settings.cashTransferEcfClosingEnabled,
      badge: "at_closing",
    },
    {
      id: "transfer",
      title: "Pagos por transferencia",
      detail:
        "Registrar venta normal. No se genera e-CF obligatorio al momento. Queda pendiente para el cierre de caja.",
      enabled: settings.cashTransferEcfClosingEnabled,
      badge: "at_closing",
    },
    {
      id: "mixed",
      title: "Pagos mixtos",
      detail:
        "Si incluye tarjeta, se genera e-CF inmediato por la venta completa. Nunca se divide el comprobante.",
      enabled: settings.cardEcfImmediateEnabled,
      badge: "ecf_immediate",
    },
    {
      id: "proforma",
      title: "Proformas",
      detail:
        "Nunca consumen secuencia fiscal real. Nunca generan e-CF real. No afectan la numeración NCF/e-CF.",
      enabled: true,
      badge: "proforma",
    },
  ];
}
