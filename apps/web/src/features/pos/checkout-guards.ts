import type { Customer } from "@/types";

/**
 * Reglas de bloqueo del cobro en POS — funciones puras y testeables.
 *
 * Regla de negocio: el cliente es OBLIGATORIO para facturar. No se permite
 * cobrar con "walk-in / consumidor final", ni con un customer_id vacío,
 * "walk-in" o inválido. Esto se valida en la UI (botón Cobrar) y como defensa
 * en profundidad antes de enviar a Supabase (nunca mandar "walk-in" como UUID).
 */

export const CUSTOMER_REQUIRED_MESSAGE =
  "Debes seleccionar o crear un cliente antes de facturar.";

const INVALID_CUSTOMER_IDS = new Set([
  "",
  "walk-in",
  "walkin",
  "consumidor final",
  "consumidor-final",
  "null",
  "undefined",
]);

/** ¿El customer_id corresponde a un cliente real (no walk-in / vacío)? */
export function isValidCustomerId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const s = id.trim();
  if (s.length === 0) return false;
  return !INVALID_CUSTOMER_IDS.has(s.toLowerCase());
}

/** ¿Hay un cliente real seleccionado? */
export function isRealCustomerSelected(
  customer: Customer | null | undefined,
): customer is Customer {
  return !!customer && isValidCustomerId(customer.id);
}

/**
 * Devuelve el mensaje de bloqueo por cliente faltante, o `null` si hay cliente
 * real. Se usa como PRIMERA validación del cobro (antes de carrito/caja/stock).
 */
export function customerChargeBlock(
  customer: Customer | null | undefined,
): string | null {
  return isRealCustomerSelected(customer) ? null : CUSTOMER_REQUIRED_MESSAGE;
}
