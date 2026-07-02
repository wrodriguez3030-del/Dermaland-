/**
 * Motor PURO de edición de facturas / ventas.
 *
 * Reglas clave (DGII / DermaLand):
 *  - Los precios son ITBIS-INCLUIDOS; la recalculación reusa `cartTotals` /
 *    `lineAmounts` de `pos/cart-line` (NO se duplica la lógica de impuesto).
 *  - El descuento por línea se captura como MONTO inclusivo (RD$) y el global
 *    como % — igual que en el POS.
 *  - Editar NO cambia número, NCF/e-CF ni el tipo de documento (eso lo blinda
 *    la capa de editabilidad + servidor); aquí solo recalculamos montos e ítems.
 *  - El stock se ajusta por DELTA respecto de la venta original (devolver /
 *    consumir), reusando el patrón cliente `adjustStockAnywhere`.
 *
 * Todo aquí es determinista y sin efectos (fácil de testear). La persistencia y
 * el ajuste de stock viven en el store/servidor.
 */

import type { Payment, Proforma, SaleItem } from "@/types";
import {
  cartTotals,
  lineAmounts,
  validateLineDiscount,
  type CartLineInput,
} from "@/features/pos/cart-line";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Línea editable de la factura (descuento como MONTO inclusivo RD$). */
export interface InvoiceEditLine {
  productId: string;
  productSku: string;
  productName: string;
  lotId?: string;
  lotNumber?: string;
  quantity: number;
  /** Precio unitario ITBIS-incluido. */
  unitPrice: number;
  itbisRate: number;
  /** Descuento por línea, monto inclusivo (RD$). */
  discountAmount: number;
}

/** Pago editable. */
export interface InvoiceEditPayment {
  id?: string;
  method: Payment["method"];
  amount: number;
  reference?: string;
  last4?: string;
}

/** Borrador completo de edición de una factura. */
export interface InvoiceEditDraft {
  customerName: string;
  customerPhone?: string | null;
  customerDocument?: string | null;
  notes?: string | null;
  items: InvoiceEditLine[];
  /** Descuento global en % (0–100). */
  globalDiscountPercent: number;
  payments: InvoiceEditPayment[];
}

/** Totales recalculados + ítems normalizados listos para persistir. */
export interface RecalcResult {
  items: SaleItem[];
  subtotal: number;
  discount: number;
  itbis: number;
  total: number;
  discountPercent: number;
  paid: number;
  balance: number;
}

function toCartLine(l: InvoiceEditLine): CartLineInput {
  return {
    unitPrice: Math.max(0, l.unitPrice),
    itbisRate: Math.max(0, l.itbisRate),
    quantity: Math.max(0, l.quantity),
    discountType: l.discountAmount > 0 ? "amount" : "none",
    discountValue: Math.max(0, l.discountAmount),
  };
}

/**
 * Recalcula ítems y totales del borrador reusando el motor del carrito.
 * `subtotal` = base bruta; `discount` = descuentos de línea + global (base);
 * `total`/`itbis` salen de `cartTotals`. Cuadra: subtotal − discount + itbis = total.
 */
export function recalcInvoice(draft: InvoiceEditDraft): RecalcResult {
  const globalPct = Math.min(100, Math.max(0, draft.globalDiscountPercent || 0));
  const lines = draft.items.map(toCartLine);
  const totals = cartTotals(lines, globalPct);

  const items: SaleItem[] = draft.items.map((l) => {
    const a = lineAmounts(toCartLine(l));
    return {
      productId: l.productId,
      productSku: l.productSku,
      productName: l.productName,
      lotId: l.lotId,
      lotNumber: l.lotNumber,
      quantity: l.quantity,
      unitPrice: round2(l.unitPrice),
      itbisRate: l.itbisRate,
      discount: a.discountBase,
      subtotal: a.netBase,
      itbis: a.itbis,
      total: a.total,
    };
  });

  const paid = round2(
    draft.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
  );
  const discount = round2(totals.lineDiscounts + totals.globalDiscount);
  const total = totals.total;

  return {
    items,
    subtotal: totals.subtotalBruto,
    discount,
    itbis: totals.itbis,
    total,
    discountPercent: globalPct,
    paid,
    balance: round2(total - paid),
  };
}

/**
 * Reconstruye una línea editable desde un `SaleItem` persistido. El descuento
 * inclusivo se deriva de `unitPrice*quantity − total` (total = neto inclusivo).
 */
export function lineFromSaleItem(it: SaleItem): InvoiceEditLine {
  const gross = round2(it.unitPrice * it.quantity);
  const discountInclusive = Math.max(0, round2(gross - it.total));
  return {
    productId: it.productId,
    productSku: it.productSku,
    productName: it.productName,
    lotId: it.lotId,
    lotNumber: it.lotNumber,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    itbisRate: it.itbisRate,
    discountAmount: discountInclusive,
  };
}

/** Construye el borrador inicial desde una proforma/factura existente. */
export function draftFromProforma(p: Proforma): InvoiceEditDraft {
  return {
    customerName: p.customerName ?? "",
    customerPhone: p.customerPhone ?? "",
    customerDocument: p.customerDocument ?? "",
    notes: p.notes ?? "",
    items: p.items.map(lineFromSaleItem),
    globalDiscountPercent: p.discountPercent ?? 0,
    payments: p.payments.map((pay) => ({
      id: pay.id,
      method: pay.method,
      amount: pay.amount,
      reference: pay.reference,
      last4: pay.last4,
    })),
  };
}

// ─── Validación ───────────────────────────────────────────────────────────────

export interface ValidateOptions {
  /**
   * Stock VENDIBLE actual por lote (currentQuantity de lotes disponibles). Se
   * usa para validar aumentos de cantidad. Si no se provee, no se valida stock.
   */
  sellableByLot?: Record<string, number>;
  /** Ítems ORIGINALES de la factura (para calcular el delta contra el stock). */
  originalItems?: SaleItem[];
}

/**
 * Valida el borrador. Devuelve mensajes AMIGABLES (sin jerga técnica). Lista
 * vacía = válido.
 */
export function validateInvoiceDraft(
  draft: InvoiceEditDraft,
  opts: ValidateOptions = {},
): string[] {
  const errors: string[] = [];
  if (!draft.customerName.trim()) {
    errors.push("El nombre del cliente es obligatorio.");
  }
  if (draft.items.length === 0) {
    errors.push("La factura debe tener al menos un producto.");
  }

  for (const l of draft.items) {
    const label = l.productName || l.productSku || "producto";
    if (!(l.quantity > 0)) {
      errors.push(`La cantidad de "${label}" debe ser mayor a 0.`);
    }
    if (l.unitPrice < 0) {
      errors.push(`El precio de "${label}" no puede ser negativo.`);
    }
    const dv = validateLineDiscount(
      l.discountAmount > 0 ? "amount" : "none",
      l.discountAmount,
      l.unitPrice,
      l.quantity,
    );
    if (!dv.ok && dv.error) errors.push(`${label}: ${dv.error}`);
  }

  if (draft.globalDiscountPercent < 0 || draft.globalDiscountPercent > 100) {
    errors.push("El descuento global debe estar entre 0% y 100%.");
  }

  // Validación de stock por lote: el aumento neto no puede superar lo disponible.
  if (opts.sellableByLot) {
    const deltas = stockDeltasForEdit(opts.originalItems ?? [], draft.items);
    for (const d of deltas) {
      if (!d.lotId) continue;
      // delta > 0 → consumimos MÁS stock del que ya se descontó.
      if (d.delta > 0) {
        const available = opts.sellableByLot[d.lotId] ?? 0;
        if (d.delta > available) {
          errors.push(
            `No hay stock suficiente para aumentar la cantidad${
              d.lotNumber ? ` del lote ${d.lotNumber}` : ""
            }. Disponible: ${available}.`,
          );
        }
      }
    }
  }

  return errors;
}

// ─── Deltas de stock ──────────────────────────────────────────────────────────

export interface StockDelta {
  lotId?: string;
  productId: string;
  lotNumber?: string;
  /**
   * Cantidad NETA a descontar respecto de la venta original:
   *  - > 0 → hay que consumir más stock (nuevo lote quantity = actual − delta).
   *  - < 0 → hay que devolver stock (nuevo lote quantity = actual + |delta|).
   */
  delta: number;
}

/**
 * Calcula, por lote, cuánto stock hay que consumir/devolver al pasar de
 * `oldItems` a `newItems`. Cambiar de lote se refleja como devolución del lote
 * viejo + consumo del nuevo (los deltas se agregan por lotId).
 */
export function stockDeltasForEdit(
  oldItems: Array<Pick<SaleItem, "lotId" | "productId" | "lotNumber" | "quantity">>,
  newItems: Array<Pick<InvoiceEditLine, "lotId" | "productId" | "lotNumber" | "quantity">>,
): StockDelta[] {
  const map = new Map<string, StockDelta>();
  const keyOf = (lotId?: string, productId?: string) => lotId ?? `prod:${productId}`;

  for (const it of oldItems) {
    if (!it.lotId) continue; // sin lote → no afecta stock
    const k = keyOf(it.lotId, it.productId);
    const cur = map.get(k) ?? {
      lotId: it.lotId,
      productId: it.productId,
      lotNumber: it.lotNumber,
      delta: 0,
    };
    cur.delta -= it.quantity; // devolver lo vendido antes
    map.set(k, cur);
  }
  for (const it of newItems) {
    if (!it.lotId) continue;
    const k = keyOf(it.lotId, it.productId);
    const cur = map.get(k) ?? {
      lotId: it.lotId,
      productId: it.productId,
      lotNumber: it.lotNumber,
      delta: 0,
    };
    cur.delta += it.quantity; // consumir lo vendido ahora
    if (!cur.lotNumber) cur.lotNumber = it.lotNumber;
    map.set(k, cur);
  }

  return [...map.values()].filter((d) => d.delta !== 0);
}

// ─── Detección de cambios sensibles (requiere motivo) ───────────────────────────

/** Firma comparable de los ítems para detectar cambios (ignora orden interno). */
function itemsSignature(
  items: Array<Pick<SaleItem, "productId" | "lotId" | "quantity" | "unitPrice" | "total">>,
): string {
  return items
    .map(
      (i) =>
        `${i.productId}|${i.lotId ?? ""}|${i.quantity}|${round2(i.unitPrice)}|${round2(i.total)}`,
    )
    .sort()
    .join(";");
}

function paymentsSignature(
  pays: Array<{ method: string; amount: number; last4?: string; reference?: string }>,
): string {
  return pays
    .map((p) => `${p.method}|${round2(p.amount)}|${p.last4 ?? ""}|${p.reference ?? ""}`)
    .sort()
    .join(";");
}

/**
 * ¿El cambio toca datos SENSIBLES (ítems, cantidades, precios, descuentos,
 * total o pagos)? En ese caso la UI/servidor exigen un motivo. Cambiar solo
 * cliente/teléfono/documento/notas NO es sensible.
 */
export function isSensitiveChange(
  original: Proforma,
  draft: InvoiceEditDraft,
): boolean {
  const recalculated = recalcInvoice(draft);
  if (itemsSignature(original.items) !== itemsSignature(recalculated.items)) {
    return true;
  }
  if (round2(original.total) !== round2(recalculated.total)) return true;
  if (round2(original.discount) !== round2(recalculated.discount)) return true;
  if (
    paymentsSignature(original.payments) !==
    paymentsSignature(draft.payments)
  ) {
    return true;
  }
  return false;
}

// ─── Diff para auditoría ────────────────────────────────────────────────────────

export interface AuditFieldChange {
  before: unknown;
  after: unknown;
}

/**
 * Construye el diff campo→(antes/después) para la bitácora. Solo incluye
 * campos que realmente cambiaron. Los ítems/pagos se resumen (conteo + total)
 * para no inflar la metadata.
 */
export function diffInvoiceForAudit(
  original: Proforma,
  draft: InvoiceEditDraft,
): Record<string, AuditFieldChange> {
  const recalculated = recalcInvoice(draft);
  const changes: Record<string, AuditFieldChange> = {};

  const cmp = (key: string, before: unknown, after: unknown) => {
    const b = typeof before === "number" ? round2(before) : (before ?? null);
    const a = typeof after === "number" ? round2(after) : (after ?? null);
    if (JSON.stringify(b) !== JSON.stringify(a)) changes[key] = { before: b, after: a };
  };

  cmp("customerName", original.customerName, draft.customerName.trim());
  cmp("customerPhone", original.customerPhone ?? null, draft.customerPhone?.trim() || null);
  cmp("customerDocument", original.customerDocument ?? null, draft.customerDocument?.trim() || null);
  cmp("notes", original.notes ?? null, draft.notes?.trim() || null);
  cmp("total", original.total, recalculated.total);
  cmp("discount", original.discount, recalculated.discount);
  cmp("itbis", original.itbis, recalculated.itbis);

  if (itemsSignature(original.items) !== itemsSignature(recalculated.items)) {
    changes.items = {
      before: { count: original.items.length, total: round2(original.total) },
      after: { count: recalculated.items.length, total: recalculated.total },
    };
  }
  if (paymentsSignature(original.payments) !== paymentsSignature(draft.payments)) {
    changes.payments = {
      before: original.payments.map((p) => ({ method: p.method, amount: round2(p.amount) })),
      after: draft.payments.map((p) => ({ method: p.method, amount: round2(p.amount) })),
    };
  }
  return changes;
}
