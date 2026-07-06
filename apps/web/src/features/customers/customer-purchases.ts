import type { Customer, Proforma } from "@/types";
import {
  normalizeDocument,
  normalizeEmail,
  normalizePhone,
} from "./customer-normalization";

/**
 * Compras reales de un cliente — lógica PURA a nivel de transacción,
 * compartida por el perfil del cliente, el reporte de clientes
 * (`customer-metrics`), los endpoints del servidor y sus tests.
 *
 * Relación principal: `sale.customerId === customer.id`. Fallback SEGURO
 * para ventas viejas sin customerId: documento / teléfono / email
 * normalizados (solo cuando la venta trae ese dato — un walk-in sin
 * documento NUNCA se mezcla con un cliente real).
 */

// Re-export de los normalizadores canónicos (compat con imports existentes).
export { normalizeDocument, normalizeEmail, normalizePhone };

/** ¿Esta venta pertenece al cliente? (id primero; identidad como fallback). */
export function saleBelongsToCustomer(
  sale: Pick<Proforma, "customerId" | "customerDocument" | "customerPhone">,
  customer: Pick<Customer, "id" | "documentNumber" | "phone">,
): boolean {
  if (sale.customerId) return sale.customerId === customer.id;
  const doc = normalizeDocument(sale.customerDocument);
  if (doc && doc === normalizeDocument(customer.documentNumber)) return true;
  const phone = normalizePhone(sale.customerPhone);
  if (phone && phone === normalizePhone(customer.phone)) return true;
  return false;
}

/** Ventas del cliente, más recientes primero. */
export function purchasesForCustomer(
  sales: Proforma[],
  customer: Pick<Customer, "id" | "documentNumber" | "phone">,
): Proforma[] {
  return sales
    .filter((s) => saleBelongsToCustomer(s, customer))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

// ─── Reglas de estado ────────────────────────────────────────────────────────
// El check de la DB admite más estados que el union TS (pending_cash_closing,
// selected_for_ecf, voided, …). Se trabaja con Sets de string para cubrir
// TODOS los valores reales sin romper el tipado.

/** Estados que cuentan como compra efectiva (dinero recibido). */
const PAID_STATUSES = new Set<string>(["paid", "partially_paid"]);
/**
 * Documento fiscal ya convertido (mismo registro): la proforma pagada que el
 * cierre de caja convirtió a e-CF. Cuenta UNA vez, como compra final.
 */
const CONVERTED_STATUSES = new Set<string>(["converted_to_ecf"]);
/** Estados que NUNCA cuentan (ni para última visita). */
const EXCLUDED_STATUSES = new Set<string>([
  "cancelled",
  "draft",
  "expired",
  "voided",
]);

/**
 * IDs de proformas que fueron convertidas en una factura POSTERIOR
 * (registro NUEVO con `sourceProformaId` apuntando a la original).
 * Esas proformas origen NO deben sumar de nuevo en gasto/compras.
 */
export function collectConvertedSourceIds(sales: Proforma[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sales) {
    if (s.sourceProformaId && !EXCLUDED_STATUSES.has(s.status)) {
      ids.add(s.sourceProformaId);
    }
  }
  return ids;
}

/**
 * ¿Es una transacción FINAL del cliente? (cuenta para gasto/compras)
 *
 * Reglas centrales — una sola definición para perfil, reporte y dashboard:
 *  - Anuladas / borrador / vencidas / voided → NO.
 *  - Proforma que fue convertida en factura (otra fila la referencia por
 *    `sourceProformaId`) → NO (cuenta el documento final, no la proforma).
 *  - Factura (invoice) pagada o con pago parcial → SÍ.
 *  - Proforma pagada (sin conversión) o convertida a e-CF (misma fila) → SÍ.
 */
export function isFinalCustomerTransaction(
  sale: Proforma,
  convertedSourceIds?: Set<string>,
): boolean {
  if (EXCLUDED_STATUSES.has(sale.status)) return false;
  if (convertedSourceIds?.has(sale.id)) return false;
  return PAID_STATUSES.has(sale.status) || CONVERTED_STATUSES.has(sale.status);
}

export interface CustomerPurchaseStats {
  /** Suma de transacciones finales (pagadas; parciales suman lo pagado). */
  totalSpent: number;
  /** Cantidad de transacciones finales reales (sin duplicar conversiones). */
  purchases: number;
  /** Ticket promedio: totalSpent / purchases (0 si no hay compras). */
  avgTicket: number;
  /** Fecha de la última venta (cualquier estado no anulado), o null. */
  lastVisitAt: string | null;
  /** Proformas pendientes (no fiscales), mostradas aparte. */
  pendingProformas: number;
}

export function computeCustomerPurchaseStats(
  purchases: Proforma[],
  convertedSourceIds?: Set<string>,
): CustomerPurchaseStats {
  const converted = convertedSourceIds ?? collectConvertedSourceIds(purchases);
  let totalSpent = 0;
  let count = 0;
  let lastVisitAt: string | null = null;
  let pendingProformas = 0;
  for (const p of purchases) {
    if (EXCLUDED_STATUSES.has(p.status)) continue;
    if (!lastVisitAt || p.createdAt > lastVisitAt) lastVisitAt = p.createdAt;
    if (converted.has(p.id)) continue; // convertida: cuenta el doc final
    if (isFinalCustomerTransaction(p, converted)) {
      totalSpent += p.status === "partially_paid" ? p.paid : p.total;
      count += 1;
    } else if (p.documentKind !== "invoice") {
      pendingProformas += 1;
    }
  }
  return {
    totalSpent,
    purchases: count,
    avgTicket: count > 0 ? totalSpent / count : 0,
    lastVisitAt,
    pendingProformas,
  };
}
