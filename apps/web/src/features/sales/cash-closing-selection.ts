import type { Proforma } from "@/types";

/**
 * Selección FIFO de proformas para conversión a e-CF durante el cierre de caja.
 *
 * Regla: las proformas más antiguas se seleccionan primero hasta acumular
 * al menos `targetAmount`. La idea es que el porcentaje de conversión
 * (configurable por el usuario en el cierre) se aplique a las ventas que
 * llevan más tiempo pendientes, no a las recién emitidas.
 *
 * Si `targetAmount === 0`: no se selecciona ninguna proforma.
 * Si `targetAmount >= sum(proformas)`: se seleccionan todas.
 *
 * Devuelve los IDs seleccionados, el monto acumulado y la cantidad. El
 * caller (UI) puede luego permitir ajuste manual marcando/desmarcando.
 *
 * **Reglas fiscales** (documento DGII §17): el porcentaje y la selección
 * de proformas a convertir es DECISIÓN OPERATIVA del cierre. El sistema
 * NO debe usar esto para evadir obligaciones fiscales. La validación con
 * contador es obligatoria — duda F-03 en `matriz-requisitos-dgii.md`.
 */

export interface FifoSelectionInput {
  proformas: ReadonlyArray<Proforma>;
  /** Monto objetivo a cubrir en RD$. */
  targetAmount: number;
}

export interface FifoSelectionResult {
  selectedIds: ReadonlyArray<string>;
  selectedAmount: number;
  selectedCount: number;
  remainingAmount: number;
  remainingCount: number;
  /** Diferencia: selectedAmount - targetAmount (puede ser ≥ 0 por overshoot). */
  difference: number;
}

export function selectProformasFifo(
  input: FifoSelectionInput,
): FifoSelectionResult {
  const total = input.proformas.reduce((s, p) => s + p.total, 0);
  const count = input.proformas.length;

  if (input.targetAmount <= 0) {
    return {
      selectedIds: [],
      selectedAmount: 0,
      selectedCount: 0,
      remainingAmount: total,
      remainingCount: count,
      difference: -input.targetAmount,
    };
  }

  // Orden ascendente por fecha de creación (más antiguas primero).
  const sorted = [...input.proformas].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  );

  const selected: string[] = [];
  let acumulado = 0;
  for (const p of sorted) {
    if (acumulado >= input.targetAmount) break;
    selected.push(p.id);
    acumulado += p.total;
  }

  return {
    selectedIds: selected,
    selectedAmount: acumulado,
    selectedCount: selected.length,
    remainingAmount: Math.max(0, total - acumulado),
    remainingCount: count - selected.length,
    difference: acumulado - input.targetAmount,
  };
}

/**
 * Calcula el monto objetivo dado un total y un porcentaje (0..100).
 * Clampea el porcentaje fuera de rango.
 */
export function computeTargetAmount(
  totalPendiente: number,
  percentage: number,
): number {
  const safe = Math.min(100, Math.max(0, percentage));
  return totalPendiente * (safe / 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Selección "redondeo hacia arriba por factura completa" para el cierre de caja.
//
// Reglas (documento DGII §6-8):
//  - El porcentaje lo define ADMIN en la Configuración de facturación; el cierre
//    sólo lo lee. Aquí recibimos el porcentaje ya resuelto.
//  - Nunca se divide una venta: se seleccionan ventas COMPLETAS hasta alcanzar
//    o superar el objetivo (redondeo hacia arriba).
//  - Estrategia: `last` (últimas ventas del día, default), `first` (primeras),
//    `manual` (no auto-selecciona; el caller decide).
//  - Se reporta la diferencia por redondeo (generado − objetivo).
//
// Ejemplo del documento:
//   total 10,000 · 15% → objetivo 1,500
//   ventas [1,000, 800, 500] (según orden) → selecciona 1,000 + 800 = 1,800
//   diferencia por redondeo = 300, nunca factura parcial.
// ─────────────────────────────────────────────────────────────────────────────

export type SelectionStrategy = "last" | "first" | "manual";

export interface EcfClosingSale {
  id: string;
  amount: number;
  /** ISO date de la venta — usado para ordenar por estrategia. */
  createdAt: string;
}

export interface EcfClosingSelectionInput {
  sales: ReadonlyArray<EcfClosingSale>;
  /** Porcentaje 0..100 definido por ADMIN. */
  percentage: number;
  /** Estrategia de selección. Default `last`. */
  strategy?: SelectionStrategy;
}

export interface EcfClosingSelectionResult {
  /** Total de ventas elegibles (efectivo + transferencia pendientes). */
  totalEligible: number;
  /** Monto objetivo = total * % (sin redondear). */
  targetAmount: number;
  /** Monto realmente generado con facturas completas (≥ objetivo o todo). */
  generatedAmount: number;
  /** Diferencia por factura completa = generado − objetivo (≥ 0). */
  roundingDifference: number;
  selectedIds: ReadonlyArray<string>;
  selectedCount: number;
  pendingAmount: number;
}

/**
 * Selecciona ventas COMPLETAS para alcanzar o superar el objetivo, sin dividir
 * ninguna venta. Para `manual` no auto-selecciona (selectedIds vacío); el caller
 * arma la selección y puede usar `summarizeEcfSelection` para los totales.
 */
export function selectSalesForEcfClosing(
  input: EcfClosingSelectionInput,
): EcfClosingSelectionResult {
  const strategy = input.strategy ?? "last";
  const totalEligible = input.sales.reduce((s, v) => s + v.amount, 0);
  const safePct = Math.min(100, Math.max(0, input.percentage));
  const targetAmount = totalEligible * (safePct / 100);

  if (strategy === "manual" || safePct <= 0 || input.sales.length === 0) {
    return {
      totalEligible,
      targetAmount,
      generatedAmount: 0,
      roundingDifference: safePct <= 0 ? 0 : 0,
      selectedIds: [],
      selectedCount: 0,
      pendingAmount: totalEligible,
    };
  }

  // Ordenar por fecha; `last` = más recientes primero, `first` = más antiguas.
  const sorted = [...input.sales].sort((a, b) => {
    const diff = +new Date(a.createdAt) - +new Date(b.createdAt);
    return strategy === "last" ? -diff : diff;
  });

  const selected: string[] = [];
  let generated = 0;
  for (const sale of sorted) {
    if (generated >= targetAmount) break;
    selected.push(sale.id);
    generated += sale.amount;
  }

  return {
    totalEligible,
    targetAmount,
    generatedAmount: generated,
    roundingDifference: Math.max(0, generated - targetAmount),
    selectedIds: selected,
    selectedCount: selected.length,
    pendingAmount: Math.max(0, totalEligible - generated),
  };
}

/**
 * Recalcula los totales para una selección arbitraria (ej. ajuste manual del
 * cajero/admin). Útil para `manual` o tras marcar/desmarcar ventas.
 */
export function summarizeEcfSelection(
  sales: ReadonlyArray<EcfClosingSale>,
  selectedIds: ReadonlyArray<string>,
  percentage: number,
): EcfClosingSelectionResult {
  const set = new Set(selectedIds);
  const totalEligible = sales.reduce((s, v) => s + v.amount, 0);
  const safePct = Math.min(100, Math.max(0, percentage));
  const targetAmount = totalEligible * (safePct / 100);
  const selected = sales.filter((v) => set.has(v.id));
  const generated = selected.reduce((s, v) => s + v.amount, 0);
  return {
    totalEligible,
    targetAmount,
    generatedAmount: generated,
    roundingDifference: Math.max(0, generated - targetAmount),
    selectedIds: selected.map((v) => v.id),
    selectedCount: selected.length,
    pendingAmount: Math.max(0, totalEligible - generated),
  };
}
