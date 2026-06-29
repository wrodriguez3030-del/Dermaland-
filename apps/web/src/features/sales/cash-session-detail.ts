import type { CashRegisterSession, PaymentMethod, Proforma } from "@/types";

/**
 * Cálculo de "Detalles del turno en curso" — figuras de caja de una sesión a
 * partir de las proformas/facturas y sus pagos reales (fuente de verdad), más
 * los movimientos manuales de efectivo (ingresos/retiros) y devoluciones.
 *
 * Presentación/cálculo puro: NO toca DGII real, secuencias ni datos. No depende
 * de React ni del DOM (testeable en node).
 *
 * Regla clave del DINERO FÍSICO ESPERADO EN CAJA: solo cuenta efectivo real
 * (base inicial + ventas en efectivo + ingresos en efectivo − devoluciones en
 * efectivo − retiros en efectivo). Tarjeta y transferencia se reportan como
 * ventas pero NO aumentan el efectivo físico esperado.
 */

/** Movimiento manual de efectivo del turno (ingreso/retiro) o devolución. */
export interface CashShiftMovement {
  type: "income" | "withdrawal" | "refund";
  amount: number;
  /** Método del movimiento; por defecto efectivo. Solo el efectivo afecta caja física. */
  method?: PaymentMethod;
}

export interface ShiftDetail {
  openedAt: string;
  cashierName: string;
  branchName: string | null;
  sessionNumber: string;
  openingAmount: number;
  /** Total de ventas del turno (suma de ventas no anuladas). */
  totalSales: number;
  // Desglose por método de pago
  salesCash: number;
  /** Tarjeta (incluye procesadores Azul/CardNET/VisaNet). El modelo no separa débito/crédito. */
  salesCard: number;
  salesTransfer: number;
  /** Otros métodos (PayPal, manual, otro). */
  salesOther: number;
  // Movimientos de efectivo
  refundsCash: number;
  cashIncome: number;
  cashWithdrawal: number;
  /** base + ventas (efectivo+tarjeta+transferencia+otros) + ingresos − devoluciones − retiros. */
  totalShiftMovements: number;
  /** DINERO FÍSICO esperado en caja (solo efectivo). */
  expectedCash: number;
  countedCash: number | null;
  /** Diferencia (contado − esperado) si la caja ya fue contada. */
  difference: number | null;
}

/** Métodos que cuentan como "tarjeta" (no efectivo, no transferencia). */
const CARD_METHODS: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>([
  "card",
  "azul",
  "cardnet",
  "visanet",
]);

/** Estados de venta que cuentan para el turno (excluye anuladas/borrador). */
function isCountedSale(p: Proforma): boolean {
  return (
    p.status === "paid" ||
    p.status === "partially_paid" ||
    p.status === "pending_ecf" ||
    p.status === "converted_to_ecf" ||
    p.status === "issued"
  );
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function computeShiftDetail(
  session: CashRegisterSession,
  proformas: Proforma[],
  movements: CashShiftMovement[] = [],
  branchName: string | null = null,
): ShiftDetail {
  const sessionSales = proformas.filter(
    (p) => p.cashRegisterSessionId === session.id && isCountedSale(p),
  );

  let salesCash = 0;
  let salesCard = 0;
  let salesTransfer = 0;
  let salesOther = 0;
  let totalSales = 0;

  for (const p of sessionSales) {
    totalSales += p.total;
    for (const pay of p.payments ?? []) {
      const amt = pay.amount ?? 0;
      if (pay.method === "cash") salesCash += amt;
      else if (CARD_METHODS.has(pay.method)) salesCard += amt;
      else if (pay.method === "transfer") salesTransfer += amt;
      else salesOther += amt;
    }
  }

  // Movimientos manuales — solo el efectivo afecta el conteo físico.
  let cashIncome = 0;
  let cashWithdrawal = 0;
  let refundsCash = 0;
  for (const m of movements) {
    const isCash = (m.method ?? "cash") === "cash";
    if (!isCash) continue;
    if (m.type === "income") cashIncome += m.amount;
    else if (m.type === "withdrawal") cashWithdrawal += m.amount;
    else if (m.type === "refund") refundsCash += m.amount;
  }

  const openingAmount = session.openingAmount ?? 0;

  const expectedCash =
    openingAmount + salesCash + cashIncome - refundsCash - cashWithdrawal;

  const totalShiftMovements =
    openingAmount +
    salesCash +
    salesCard +
    salesTransfer +
    salesOther +
    cashIncome -
    refundsCash -
    cashWithdrawal;

  const countedCash = session.countedCash ?? null;
  const difference =
    countedCash != null ? round2(countedCash - expectedCash) : null;

  return {
    openedAt: session.openedAt,
    cashierName: session.cashierName,
    branchName,
    sessionNumber: session.sessionNumber,
    openingAmount: round2(openingAmount),
    totalSales: round2(totalSales),
    salesCash: round2(salesCash),
    salesCard: round2(salesCard),
    salesTransfer: round2(salesTransfer),
    salesOther: round2(salesOther),
    refundsCash: round2(refundsCash),
    cashIncome: round2(cashIncome),
    cashWithdrawal: round2(cashWithdrawal),
    totalShiftMovements: round2(totalShiftMovements),
    expectedCash: round2(expectedCash),
    countedCash: countedCash != null ? round2(countedCash) : null,
    difference,
  };
}
