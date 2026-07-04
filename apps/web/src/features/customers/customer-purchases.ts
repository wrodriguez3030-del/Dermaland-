import type { Customer, Proforma } from "@/types";

/**
 * Compras reales de un cliente — lógica PURA compartida por el perfil del
 * cliente y sus tests.
 *
 * Relación principal: `sale.customerId === customer.id`. Fallback SEGURO
 * para ventas viejas sin customerId: documento / teléfono / email
 * normalizados (solo cuando la venta trae ese dato — un walk-in sin
 * documento NUNCA se mezcla con un cliente real).
 */

/** Documento: solo dígitos (031-0327428-2 == 03103274282). */
export function normalizeDocument(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Teléfono: solo dígitos, ignorando el prefijo país 1 (829-714-1975 == +18297141975). */
export function normalizePhone(v: string | null | undefined): string {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
}

/** Email: lowercase + trim. */
export function normalizeEmail(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

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

/** Estados que cuentan como compra efectiva (no anuladas/borrador). */
const PAID_STATUSES = new Set(["paid", "partially_paid"]);
const EXCLUDED_STATUSES = new Set(["cancelled", "draft", "expired"]);

export interface CustomerPurchaseStats {
  /** Suma de facturas pagadas (excluye anuladas/borradores/proformas pendientes). */
  totalSpent: number;
  /** Cantidad de facturas pagadas. */
  purchases: number;
  /** Fecha de la última venta (cualquier estado no anulado), o null. */
  lastVisitAt: string | null;
  /** Proformas pendientes (no fiscales), mostradas aparte. */
  pendingProformas: number;
}

export function computeCustomerPurchaseStats(
  purchases: Proforma[],
): CustomerPurchaseStats {
  let totalSpent = 0;
  let count = 0;
  let lastVisitAt: string | null = null;
  let pendingProformas = 0;
  for (const p of purchases) {
    if (EXCLUDED_STATUSES.has(p.status)) continue;
    if (!lastVisitAt || p.createdAt > lastVisitAt) lastVisitAt = p.createdAt;
    const isInvoice = p.documentKind === "invoice";
    if (isInvoice && PAID_STATUSES.has(p.status)) {
      totalSpent += p.status === "partially_paid" ? p.paid : p.total;
      count += 1;
    } else if (!isInvoice) {
      if (PAID_STATUSES.has(p.status)) {
        // Proforma pagada/convertida cuenta como compra (regla actual).
        totalSpent += p.total;
        count += 1;
      } else {
        pendingProformas += 1;
      }
    }
  }
  return { totalSpent, purchases: count, lastVisitAt, pendingProformas };
}
