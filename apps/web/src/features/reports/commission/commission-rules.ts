// Reglas de comisión CONFIGURABLES (no hardcodeadas en la página).
//
// Derivadas del análisis del Excel de referencia (ver
// docs/reports/COMISION_VENTAS_RULES.md):
//   - Efectivo (cash) y Transferencia (transfer) → 3%
//   - Tarjeta / crédito (card = card/azul/cardnet/visanet) → 1%
//   - Otros (paypal/manual/other), mixto y sin pago → sin regla (no comisiona)
//
// Fase 2: estas reglas se leerán de la tabla `sales_commission_rules` (editable
// por UI). El motor ya acepta un arreglo de reglas, así que migrarlo no cambia la
// lógica de cálculo.

import type { PaymentGroup } from "@/features/sales/sales-report";

export interface CommissionRule {
  id: string;
  name: string;
  /** Tasa en PORCENTAJE (3 = 3%, 1 = 1%). */
  percentage: number;
  /** Grupos de método de pago canónicos a los que aplica. undefined = cualquiera. */
  paymentGroups?: PaymentGroup[];
  /** Restricciones opcionales (Fase 2, editables por UI). */
  sellerId?: string;
  branchId?: string;
  /** Vigencia YYYY-MM-DD (inclusive). undefined = sin límite. */
  startsAt?: string;
  endsAt?: string;
  /** Mayor prioridad gana cuando varias reglas matchean. */
  priority: number;
  active: boolean;
}

/** Catálogo por defecto (mayo 2026). Editable a futuro desde DB. */
export const DEFAULT_COMMISSION_RULES: CommissionRule[] = [
  {
    id: "rule_cash_transfer_3",
    name: "Efectivo y transferencia 3%",
    percentage: 3,
    paymentGroups: ["cash", "transfer"],
    priority: 10,
    active: true,
  },
  {
    id: "rule_card_1",
    name: "Tarjeta / crédito 1%",
    percentage: 1,
    paymentGroups: ["card"],
    priority: 10,
    active: true,
  },
];

/**
 * Exclusiones manuales por número de comprobante (Fase 2: tabla dedicada).
 * El Excel de mayo tenía 13 ventas excluidas a mano; se dejan configurables aquí
 * en vez de inventar una regla automática que no existe.
 */
export const DEFAULT_MANUAL_EXCLUSIONS: ReadonlyArray<string> = [];
