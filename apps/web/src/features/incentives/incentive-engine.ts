/**
 * Motor de cálculo de incentivos — PURO (sin red, sin fs, sin React).
 * Compartido por la generación (al pagar la venta) y los tests.
 *
 * BASE del incentivo = venta NETA sin ITBIS, después de descuentos
 * (`SaleItem.subtotal` ya es pre-ITBIS post-descuento en el modelo). El
 * margen usa el costo del producto: neto − costo × cantidad.
 *
 * El resultado es un SNAPSHOT: se guarda tal cual; una regla que cambie
 * después NO altera incentivos ya generados.
 */

export type IncentiveRuleType =
  | "fixed_per_product"
  | "percent_on_sale"
  | "percent_on_margin"
  | "per_laboratory"
  | "per_category"
  | "per_goal";

export interface IncentiveRule {
  id: string;
  name: string;
  ruleType: IncentiveRuleType;
  productId?: string | null;
  laboratoryId?: string | null;
  categoryId?: string | null;
  percentage?: number | null;
  fixedAmount?: number | null;
  minSalesAmount?: number | null;
  startsAt?: string | null; // YYYY-MM-DD
  endsAt?: string | null;
  active: boolean;
}

/** Datos del producto necesarios para reglas de lab/categoría/margen. */
export interface ProductInfo {
  id: string;
  laboratoryId?: string | null;
  categoryId?: string | null;
  cost?: number | null;
}

export interface SaleItemForIncentive {
  productId: string;
  quantity: number;
  /** Neto sin ITBIS después de descuento (SaleItem.subtotal). */
  subtotal: number;
}

export interface SaleForIncentive {
  id: string;
  sellerId?: string | null;
  sellerName?: string | null;
  createdAt: string;
  status: string;
  items: SaleItemForIncentive[];
}

export interface IncentiveSnapshot {
  saleId: string;
  sellerId: string | null;
  sellerName: string | null;
  ruleId: string;
  ruleName: string;
  ruleType: IncentiveRuleType;
  productId: string | null;
  baseAmount: number;
  incentiveAmount: number;
}

const PAID_STATUSES = new Set(["paid", "partially_paid", "issued", "converted_to_ecf"]);

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** ¿La regla está vigente en la fecha de la venta? */
export function isRuleActiveOn(rule: IncentiveRule, isoDate: string): boolean {
  if (!rule.active) return false;
  const day = isoDate.slice(0, 10);
  if (rule.startsAt && day < rule.startsAt) return false;
  if (rule.endsAt && day > rule.endsAt) return false;
  return true;
}

function pct(rule: IncentiveRule): number {
  return typeof rule.percentage === "number" ? rule.percentage : 0;
}
function fixed(rule: IncentiveRule): number {
  return typeof rule.fixedAmount === "number" ? rule.fixedAmount : 0;
}

/**
 * Calcula el/los incentivo(s) que UNA regla genera para UNA venta.
 * Devuelve [] si la regla no aplica o el incentivo es 0.
 * `per_goal` NO se resuelve aquí (es periódico) → siempre [].
 */
export function computeRuleForSale(
  rule: IncentiveRule,
  sale: SaleForIncentive,
  products: Map<string, ProductInfo>,
): IncentiveSnapshot[] {
  const netTotal = sale.items.reduce((s, it) => s + it.subtotal, 0);

  const base = (productId: string | null, amount: number): IncentiveSnapshot => ({
    saleId: sale.id,
    sellerId: sale.sellerId ?? null,
    sellerName: sale.sellerName ?? null,
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    productId,
    baseAmount: 0,
    incentiveAmount: amount,
  });

  switch (rule.ruleType) {
    case "fixed_per_product": {
      if (!rule.productId) return [];
      const lines = sale.items.filter((it) => it.productId === rule.productId);
      if (lines.length === 0) return [];
      const qty = lines.reduce((s, it) => s + it.quantity, 0);
      const net = lines.reduce((s, it) => s + it.subtotal, 0);
      const amount = r2(fixed(rule) * qty);
      if (amount <= 0) return [];
      return [{ ...base(rule.productId, amount), baseAmount: r2(net) }];
    }

    case "percent_on_sale": {
      if (rule.minSalesAmount && netTotal < rule.minSalesAmount) return [];
      const amount = r2((netTotal * pct(rule)) / 100);
      if (amount <= 0) return [];
      return [{ ...base(null, amount), baseAmount: r2(netTotal) }];
    }

    case "percent_on_margin": {
      let margin = 0;
      for (const it of sale.items) {
        const cost = products.get(it.productId)?.cost ?? 0;
        margin += it.subtotal - cost * it.quantity;
      }
      const amount = r2((margin * pct(rule)) / 100);
      if (amount <= 0) return [];
      return [{ ...base(null, amount), baseAmount: r2(margin) }];
    }

    case "per_laboratory": {
      if (!rule.laboratoryId) return [];
      const lines = sale.items.filter(
        (it) => products.get(it.productId)?.laboratoryId === rule.laboratoryId,
      );
      if (lines.length === 0) return [];
      const net = lines.reduce((s, it) => s + it.subtotal, 0);
      const qty = lines.reduce((s, it) => s + it.quantity, 0);
      const amount = rule.percentage
        ? r2((net * pct(rule)) / 100)
        : r2(fixed(rule) * qty);
      if (amount <= 0) return [];
      return [{ ...base(null, amount), baseAmount: r2(net) }];
    }

    case "per_category": {
      if (!rule.categoryId) return [];
      const lines = sale.items.filter(
        (it) => products.get(it.productId)?.categoryId === rule.categoryId,
      );
      if (lines.length === 0) return [];
      const net = lines.reduce((s, it) => s + it.subtotal, 0);
      const qty = lines.reduce((s, it) => s + it.quantity, 0);
      const amount = rule.percentage
        ? r2((net * pct(rule)) / 100)
        : r2(fixed(rule) * qty);
      if (amount <= 0) return [];
      return [{ ...base(null, amount), baseAmount: r2(net) }];
    }

    case "per_goal":
      // Meta periódica: se evalúa en agregación (pantalla de pagos), no por
      // venta individual. Ver `evaluateGoalRule` para el cierre de período.
      return [];

    default:
      return [];
  }
}

/**
 * Calcula TODOS los incentivos de una venta pagada con vendedor asignado.
 * Sin vendedor o venta no pagada → []. Aplica solo reglas vigentes.
 */
export function computeIncentivesForSale(
  sale: SaleForIncentive,
  rules: IncentiveRule[],
  products: Map<string, ProductInfo>,
): IncentiveSnapshot[] {
  if (!sale.sellerId) return [];
  if (!PAID_STATUSES.has(sale.status)) return [];
  const out: IncentiveSnapshot[] = [];
  for (const rule of rules) {
    if (!isRuleActiveOn(rule, sale.createdAt)) continue;
    out.push(...computeRuleForSale(rule, sale, products));
  }
  return out;
}

/**
 * Meta por período: si el total NETO vendido por el vendedor en el período
 * alcanza `minSalesAmount`, devuelve el incentivo (fijo, o % sobre el total).
 * Se usa en el cierre/pago, no en la venta individual.
 */
export function evaluateGoalRule(
  rule: IncentiveRule,
  sellerNetTotal: number,
): number {
  if (rule.ruleType !== "per_goal") return 0;
  if (!rule.minSalesAmount || sellerNetTotal < rule.minSalesAmount) return 0;
  if (rule.percentage) return r2((sellerNetTotal * pct(rule)) / 100);
  return r2(fixed(rule));
}

/**
 * Ajuste por DEVOLUCIÓN/anulación: los incentivos de una venta anulada se
 * revierten. Devuelve los ids a anular (status → 'void') si la venta ya no
 * está pagada. No borra: mantiene historial.
 */
export function incentivesToVoidForCancelledSale(
  saleStatus: string,
  existing: { id: string; status: string }[],
): string[] {
  if (PAID_STATUSES.has(saleStatus)) return [];
  return existing
    .filter((i) => i.status === "pending" || i.status === "approved")
    .map((i) => i.id);
}
