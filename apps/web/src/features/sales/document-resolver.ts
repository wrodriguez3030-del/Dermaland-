import type { DefaultBillingType, PaymentMethod } from "@/types";

/**
 * @deprecated LEGADO — el POS NO usa este módulo. La fuente única de la
 * decisión documental (R-FIS-01) es `features/billing/auto-billing-rules.ts`
 * (`resolveAutoBilling`), que cubre B01/B02/E31/E32 según el modo NCF/e-CF
 * del negocio y ya diverge de las reglas de abajo (ej. efectivo puede emitir
 * B02 inmediato en modo NCF). Se conserva solo por sus tests históricos;
 * NO agregar consumidores nuevos ni ajustar reglas aquí — hacerlo en
 * auto-billing-rules.
 *
 * Decide qué documento debe emitirse al cobrar en POS, en función del tipo
 * de facturación del cliente y el método de pago elegido.
 *
 * Reglas (DermaLand RD — MVP, antes de integración DGII real):
 *
 *   billingType        | paymentMethod                   | resultado
 *   ───────────────────┼─────────────────────────────────┼──────────────────────────
 *   consumo            | cash · transfer                 | Proforma (no fiscal)
 *   consumo            | card · azul · cardnet · visanet | Factura e-CF 32 (Consumo)
 *   consumo            | paypal · manual · other         | Proforma (no fiscal)
 *   consumo            | null (sin selección)            | Proforma (placeholder UI)
 *   credito_fiscal     | cualquiera (incluye null)       | Factura e-CF 31 (Crédito Fiscal)
 *
 * Notas:
 *  - La secuencia DGII real se preparará en backend (sequenceType es el ancla
 *    para que el repositorio escoja la secuencia correcta cuando el módulo
 *    fiscal esté activo).
 *  - "Proforma placeholder" sólo aplica a la UI antes de que el cajero elija
 *    método de pago. La emisión real exige `paymentMethod !== null`.
 *
 * Riesgo abierto (R-FIS-01): la regla final debe confirmarse contra la
 * política fiscal de la empresa antes de producción. Ver `docs/riesgos.md`.
 */

export type EcfType = "31" | "32";
export type SequenceType = "consumo" | "credito_fiscal";
export type DocumentKind = "proforma" | "invoice";

export interface ResolveDocumentInput {
  billingType: DefaultBillingType;
  paymentMethod: PaymentMethod | null;
}

export interface ResolvedDocument {
  documentKind: DocumentKind;
  ecfType: EcfType | null;
  sequenceType: SequenceType | null;
  /** Etiqueta corta para chips/indicadores de UI. */
  label: string;
  /** Etiqueta para el botón de cobro/emisión. */
  buttonLabel: string;
}

/**
 * Métodos de pago equivalentes a "tarjeta" para efectos de e-CF de Consumo.
 * Procesadores locales (Azul, CardNET, VisaNet) caen aquí.
 */
const CARD_LIKE_METHODS: ReadonlyArray<PaymentMethod> = [
  "card",
  "azul",
  "cardnet",
  "visanet",
];

export function resolveDocumentToIssue(
  input: ResolveDocumentInput,
): ResolvedDocument {
  const { billingType, paymentMethod } = input;

  // Crédito fiscal: siempre factura e-CF 31, independiente del método de pago.
  if (billingType === "credito_fiscal") {
    return {
      documentKind: "invoice",
      ecfType: "31",
      sequenceType: "credito_fiscal",
      label: "Factura e-CF Crédito Fiscal",
      buttonLabel: "Cobrar y emitir factura",
    };
  }

  // billingType === "consumo"
  const isCardLike =
    paymentMethod !== null && CARD_LIKE_METHODS.includes(paymentMethod);

  if (isCardLike) {
    return {
      documentKind: "invoice",
      ecfType: "32",
      sequenceType: "consumo",
      label: "Factura e-CF Consumo",
      buttonLabel: "Cobrar y emitir factura",
    };
  }

  // Efectivo, transferencia, paypal, manual, other, o aún sin seleccionar.
  return {
    documentKind: "proforma",
    ecfType: null,
    sequenceType: null,
    label: "Proforma",
    buttonLabel: "Cobrar y emitir proforma",
  };
}
