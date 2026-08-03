// Disponibilidad de cara al público.
//
// La cantidad exacta de existencias es información interna: revela volumen de
// compra, rotación y capacidad de suministro. La tienda solo dice "En
// existencia" o "Agotado", y el colapso a booleano ocurre EN EL SERVIDOR, antes
// de que el dato salga: por eso `availabilityFrom` devuelve un objeto que no
// contiene la cantidad ni puede reconstruirla.
//
// La regla de qué lote cuenta es la misma del POS (`features/inventory/lot-store.ts`,
// `isLotSellable`): disponible, con existencias y sin vencer. Se reimplementa
// aquí en forma pura y sin dependencias porque el lado público lee filas crudas
// de Supabase, no el store de cliente del ERP.

import type { Availability } from "./types";

/** Estados de lote que la tienda considera vendibles. */
const ESTADO_VENDIBLE = "available";

export interface WebLotRow {
  status: string;
  currentQuantity: number;
  /** Fecha de vencimiento en formato `YYYY-MM-DD`. */
  expiresAt: string | null;
}

/**
 * ¿Este lote suma para la disponibilidad pública?
 *
 * `hoy` se recibe como parámetro (no se llama a `new Date()` dentro) para que la
 * función sea pura, testeable y estable entre servidor y cliente — el mismo
 * motivo por el que el resto del proyecto usa el patrón `mounted`.
 */
export function isSellableForWeb(lot: WebLotRow, hoy: string): boolean {
  if (lot.status !== ESTADO_VENDIBLE) return false;
  if (!(lot.currentQuantity > 0)) return false;
  // Sin fecha no se puede afirmar que esté vigente: se descarta por prudencia.
  if (!lot.expiresAt) return false;
  // Comparación de cadenas `YYYY-MM-DD`: ordena igual que las fechas y evita
  // los desfases de zona horaria de `new Date("2026-08-03")`.
  return lot.expiresAt >= hoy;
}

/** Traduce una cantidad interna al único dato que ve el cliente. */
export function availabilityFrom(quantity: number): Availability {
  return quantity > 0
    ? { status: "in_stock", label: "En existencia" }
    : { status: "out_of_stock", label: "Agotado" };
}
