import { formatCurrency } from "@/lib/utils/format";

/**
 * Conteo de efectivo por denominaciones para el cierre de caja.
 *
 * Pura, sin React ni DOM: el asistente de cierre suma con esto y las pruebas
 * corren en node. Denominaciones del peso dominicano en circulación: billetes
 * de 2000 a 50 y monedas de 25 a 1.
 */

export const RD_DENOMINATIONS = [
  2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1,
] as const;

const DENOMS = new Set<number>(RD_DENOMINATIONS);

/** Total del conteo: cantidad × denominación. Cantidades raras cuentan cero. */
export function cashCountTotal(counts: Record<number, number>): number {
  let total = 0;
  for (const [denomStr, qty] of Object.entries(counts)) {
    const denom = Number(denomStr);
    if (!DENOMS.has(denom)) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    total += denom * qty;
  }
  return Math.round(total * 100) / 100;
}

export interface DifferenceLabel {
  tone: "ok" | "sobra" | "falta";
  label: string;
}

/**
 * La diferencia dicha en cristiano. Dentro del centavo cuadra: los redondeos
 * de dividir centavos no son un faltante.
 */
export function differenceLabel(diff: number): DifferenceLabel {
  if (Math.abs(diff) < 0.005) return { tone: "ok", label: "Cuadra" };
  if (diff < 0) {
    return { tone: "falta", label: `Falta ${formatCurrency(-diff)}` };
  }
  return { tone: "sobra", label: `Sobra ${formatCurrency(diff)}` };
}
