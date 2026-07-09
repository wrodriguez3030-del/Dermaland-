// Motor PURO de precio y costo del producto (sin React, testeable).
//
// Regla de negocio (única fuente de verdad):
//
//   costo_con_itbis = costo_unidad * (1 + itbis_rate)
//   precio_venta    = costo_con_itbis * (1 + margin_rate)
//
// donde `itbis_rate` y `margin_rate` se guardan como PORCENTAJES enteros
// (18 = 18 %, 30 = 30 %), igual que `product.itbisRate` en toda la app
// (ver `pos/cart-line.ts`: `rate = itbisRate / 100`).
//
// El PRECIO DE VENTA es el dato que se persiste (columna `products.price`).
// El MARGEN no se guarda aparte: se DERIVA del precio guardado + costo + ITBIS
// (`deriveMarginPercent`). Así el precio nunca "miente" respecto al margen
// mostrado y no hay riesgo de deriva entre dos columnas.

import type { UserRole } from "@/types";

/** Margen de ganancia por defecto al crear un producto (30 %). */
export const DEFAULT_MARGIN_PERCENT = 30;

/** ITBIS oficiales en RD para dermocosmética/farmacia. */
export const ITBIS_OPTIONS = [0, 16, 18] as const;

/** Tope razonable de margen (evita precios absurdos por error de tecleo). */
export const MAX_MARGIN_PERCENT = 1000;

/**
 * Modo de redondeo comercial del precio de venta.
 *  - "none"      → 2 decimales (por defecto)
 *  - "integer"   → entero más cercano
 *  - "multiple5" → múltiplo de 5 más cercano
 *  - "multiple10"→ múltiplo de 10 más cercano
 */
export type RoundingMode = "none" | "integer" | "multiple5" | "multiple10";

export const DEFAULT_ROUNDING: RoundingMode = "none";

export const ROUNDING_LABELS: Record<RoundingMode, string> = {
  none: "2 decimales",
  integer: "Entero más cercano",
  multiple5: "Múltiplo de 5",
  multiple10: "Múltiplo de 10",
};

/** Redondea a 2 decimales de forma estable (evita 511.32999999). */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Costo con ITBIS incluido: `cost * (1 + itbisRate/100)`. */
export function costWithItbis(cost: number, itbisRate: number): number {
  return round2(cost * (1 + safeRate(itbisRate) / 100));
}

/** Aplica el redondeo comercial elegido a un precio ya calculado. */
export function roundSalePrice(value: number, mode: RoundingMode = DEFAULT_ROUNDING): number {
  if (!Number.isFinite(value)) return 0;
  switch (mode) {
    case "integer":
      return Math.round(value);
    case "multiple5":
      return Math.round(value / 5) * 5;
    case "multiple10":
      return Math.round(value / 10) * 10;
    case "none":
    default:
      return round2(value);
  }
}

export interface SalePriceInput {
  cost: number;
  itbisRate: number;
  marginPercent: number;
  rounding?: RoundingMode;
}

/**
 * Precio de venta sugerido = costo_con_itbis * (1 + margen/100), redondeado.
 * Devuelve 0 ante entradas no finitas para no propagar NaN/Infinity a la UI.
 */
export function computeSalePrice(input: SalePriceInput): number {
  const cost = safeNumber(input.cost);
  const margin = safeNumber(input.marginPercent);
  const base = costWithItbis(cost, input.itbisRate);
  const price = base * (1 + margin / 100);
  if (!Number.isFinite(price) || price < 0) return 0;
  return roundSalePrice(price, input.rounding ?? DEFAULT_ROUNDING);
}

/**
 * Margen REAL a partir del precio efectivo:
 *   (precio - costo_con_itbis) / costo_con_itbis * 100
 * Devuelve `null` cuando el costo con ITBIS es 0 (no hay base → margen indefinido).
 */
export function realMarginPercent(
  price: number,
  cost: number,
  itbisRate: number,
): number | null {
  const base = costWithItbis(safeNumber(cost), itbisRate);
  if (base <= 0) return null;
  const m = ((safeNumber(price) - base) / base) * 100;
  return Number.isFinite(m) ? m : null;
}

/** Utilidad estimada por unidad = precio - costo_con_itbis. */
export function marginAmount(price: number, cost: number, itbisRate: number): number {
  return round2(safeNumber(price) - costWithItbis(safeNumber(cost), itbisRate));
}

/**
 * Margen a mostrar al EDITAR un producto: se deriva del precio guardado.
 * Si no hay base (costo 0) usa el margen por defecto para que el campo sea usable.
 */
export function deriveMarginPercent(
  price: number,
  cost: number,
  itbisRate: number,
): number {
  const real = realMarginPercent(price, cost, itbisRate);
  if (real == null) return DEFAULT_MARGIN_PERCENT;
  return round2(real);
}

export interface PricingBreakdown {
  cost: number;
  itbisRate: number;
  itbisAmount: number;
  costWithItbis: number;
  marginPercent: number;
  marginAmount: number;
  salePrice: number;
}

/** Desglose para el preview visual (§6). */
export function pricingBreakdown(input: SalePriceInput): PricingBreakdown {
  const cost = safeNumber(input.cost);
  const base = costWithItbis(cost, input.itbisRate);
  const salePrice = computeSalePrice(input);
  return {
    cost: round2(cost),
    itbisRate: safeRate(input.itbisRate),
    itbisAmount: round2(base - cost),
    costWithItbis: base,
    marginPercent: safeNumber(input.marginPercent),
    marginAmount: round2(salePrice - base),
    salePrice,
  };
}

// ─── Validaciones (§12) ──────────────────────────────────────────────────────

export function isValidCost(cost: number): boolean {
  return Number.isFinite(cost) && cost >= 0;
}

export function isValidMargin(margin: number): boolean {
  return Number.isFinite(margin) && margin >= 0 && margin <= MAX_MARGIN_PERCENT;
}

export function isValidItbis(itbis: number): boolean {
  return (ITBIS_OPTIONS as ReadonlyArray<number>).includes(itbis);
}

// ─── Permiso de override manual (§5/§10) ─────────────────────────────────────

const OVERRIDE_ROLES: ReadonlyArray<UserRole> = ["super_admin", "admin"];

/** ¿Puede fijar un precio manual (override) distinto del sugerido? Sólo ADMIN. */
export function canOverrideSalePrice(role: UserRole): boolean {
  return OVERRIDE_ROLES.includes(role);
}

// ─── helpers internos ────────────────────────────────────────────────────────

function safeNumber(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** ITBIS no finito o negativo se trata como 0 (exento) para no romper el cálculo. */
function safeRate(rate: number): number {
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}
