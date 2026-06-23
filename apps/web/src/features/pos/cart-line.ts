/**
 * Motor de cálculo de líneas del carrito POS (descuento por producto + ITBIS).
 *
 * Los precios de DermaLand son ITBIS-INCLUIDOS (`unitPrice` ya trae el impuesto).
 * El descuento por línea se aplica sobre el PRECIO VISIBLE (inclusivo) —lo más
 * intuitivo para el cajero— y el desglose se reporta estilo DGII: base (sin
 * ITBIS), ITBIS aparte, total = base + ITBIS.
 */

export type LineDiscountType = "none" | "percent" | "amount";

export interface CartLineInput {
  /** Precio unitario ITBIS-incluido. */
  unitPrice: number;
  /** Tasa de ITBIS en % (p. ej. 18). */
  itbisRate: number;
  quantity: number;
  discountType: LineDiscountType;
  /** % (0–100) o monto RD$ inclusivo, según `discountType`. */
  discountValue: number;
}

export interface LineAmounts {
  /** Precio total inclusivo antes de descuento (`unitPrice * quantity`). */
  grossInclusive: number;
  /** Base pre-ITBIS antes de descuento. */
  grossBase: number;
  /** Descuento en términos de base (pre-ITBIS) — va al campo `discount`. */
  discountBase: number;
  /** Descuento en términos inclusivos (lo que baja el precio visible). */
  discountInclusive: number;
  /** Base pre-ITBIS después de descuento. */
  netBase: number;
  /** ITBIS de la línea (sobre la base NETA). */
  itbis: number;
  /** Total de la línea inclusivo = netBase + itbis. */
  total: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Monto de descuento INCLUSIVO de una línea (clamp a [0, bruto]). */
export function lineDiscountInclusive(l: CartLineInput): number {
  const gross = Math.max(0, l.unitPrice) * Math.max(0, l.quantity);
  if (l.unitPrice <= 0) return 0; // sin precio → sin descuento
  if (l.discountType === "percent") {
    const pct = Math.min(100, Math.max(0, l.discountValue));
    return round2((gross * pct) / 100);
  }
  if (l.discountType === "amount") {
    return round2(Math.min(Math.max(0, l.discountValue), gross));
  }
  return 0;
}

/** Desglose completo de una línea (base, ITBIS, total) con descuento aplicado. */
export function lineAmounts(l: CartLineInput): LineAmounts {
  const rate = Math.max(0, l.itbisRate) / 100;
  const grossInclusive = round2(Math.max(0, l.unitPrice) * Math.max(0, l.quantity));
  const grossBase = round2(grossInclusive / (1 + rate));
  const discountInclusive = lineDiscountInclusive(l);
  const netInclusive = round2(grossInclusive - discountInclusive);
  const netBase = round2(netInclusive / (1 + rate));
  const discountBase = round2(grossBase - netBase);
  const itbis = round2(netInclusive - netBase);
  return {
    grossInclusive,
    grossBase,
    discountBase,
    discountInclusive,
    netBase,
    itbis,
    total: netInclusive,
  };
}

export interface CartTotals {
  /** Suma de bases pre-descuento. */
  subtotalBruto: number;
  /** Suma de descuentos por producto (base). */
  lineDiscounts: number;
  /** Base después de descuentos por línea. */
  subtotalNeto: number;
  /** Descuento global (base) = subtotalNeto * globalPct/100. */
  globalDiscount: number;
  /** ITBIS total (escalado por el descuento global). */
  itbis: number;
  /** Total a cobrar. */
  total: number;
}

/**
 * Totales del carrito. El descuento global se aplica DESPUÉS de los descuentos
 * por línea, sobre la base neta, y reduce el ITBIS proporcionalmente.
 */
export function cartTotals(lines: CartLineInput[], globalPct = 0): CartTotals {
  let subtotalBruto = 0;
  let lineDiscounts = 0;
  let subtotalNeto = 0;
  let itbisSum = 0;
  for (const l of lines) {
    const a = lineAmounts(l);
    subtotalBruto += a.grossBase;
    lineDiscounts += a.discountBase;
    subtotalNeto += a.netBase;
    itbisSum += a.itbis;
  }
  subtotalBruto = round2(subtotalBruto);
  lineDiscounts = round2(lineDiscounts);
  subtotalNeto = round2(subtotalNeto);
  const safePct = Math.min(100, Math.max(0, globalPct));
  const globalDiscount = round2(subtotalNeto * (safePct / 100));
  const taxableBase = Math.max(0, subtotalNeto - globalDiscount);
  const itbis = round2(
    subtotalNeto > 0 ? itbisSum * (taxableBase / subtotalNeto) : 0,
  );
  const total = round2(Math.max(0, taxableBase + itbis));
  return {
    subtotalBruto,
    lineDiscounts,
    subtotalNeto,
    globalDiscount,
    itbis,
    total,
  };
}

export interface LineDiscountError {
  ok: boolean;
  error?: string;
}

/** Valida un descuento por línea antes de aplicarlo (mensajes amigables). */
export function validateLineDiscount(
  type: LineDiscountType,
  value: number,
  unitPrice: number,
  quantity: number,
): LineDiscountError {
  if (type === "none") return { ok: true };
  if (unitPrice <= 0) {
    return { ok: false, error: "No se puede aplicar descuento a un producto sin precio." };
  }
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: "El descuento no puede ser negativo." };
  }
  if (type === "percent" && value > 100) {
    return { ok: false, error: "El descuento en porcentaje no puede ser mayor a 100%." };
  }
  if (type === "amount") {
    const gross = unitPrice * quantity;
    if (value > gross) {
      return { ok: false, error: "El descuento no puede ser mayor al subtotal de la línea." };
    }
  }
  return { ok: true };
}
