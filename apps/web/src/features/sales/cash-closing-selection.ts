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
