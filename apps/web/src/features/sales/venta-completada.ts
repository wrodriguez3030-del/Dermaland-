/**
 * 🔴 UNA sola definición de «venta hecha del sistema».
 *
 * Es el criterio del PANEL: un documento del sistema cuenta como venta cuando
 * ya está cobrado, cobrado a medias, emitido o convertido a e-CF. Vivía como
 * un `const SALE_DONE` dentro de `app/(app)/page.tsx`, así que cualquier otra
 * superficie que quisiera «lo mismo que el panel» tenía que copiar la lista —
 * y copiarla es exactamente como nacieron las cinco definiciones distintas del
 * mismo número que encontró la revisión de la rama `alegra-integrada`.
 *
 * Qué NO es:
 *
 *  - No es `isExcludedStatus` (`features/customers/customer-purchases.ts`).
 *    Ese dice qué NUNCA cuenta (`cancelled`, `draft`, `expired`, `voided`);
 *    este dice qué SÍ cuenta, y por eso además deja fuera lo que todavía no es
 *    una venta: `pending` y `pending_cash_closing`.
 *  - No es el criterio de las dos funciones SQL de ventas unificadas
 *    (`status not in ('cancelled','draft','expired','voided')`). Ese es el que
 *    aplica la base al histórico migrado de Alegra; el panel, a propósito,
 *    solo toma de la base la mitad de Alegra y suma la del sistema con ESTE
 *    criterio (ver `app/(app)/page.tsx`), para no contar dos veces.
 *
 * Quien necesite «lo que cuenta el panel» importa de aquí. No se copia.
 */

/** Estados de un documento del sistema que ya cuentan como venta hecha. */
export const ESTADOS_VENTA_COMPLETADA: ReadonlySet<string> = new Set([
  "paid",
  "partially_paid",
  "issued",
  "converted_to_ecf",
]);

/** ¿Este estado cuenta como venta hecha del sistema? Criterio del panel. */
export function esVentaCompletada(estado: string): boolean {
  return ESTADOS_VENTA_COMPLETADA.has(estado);
}
