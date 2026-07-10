// Motor PURO del Reporte de Comisión de Ventas (capa central, sin React/DOM).
//
// Toma las ventas reales (proformas/facturas ya traídas de Supabase con RLS) y
// calcula la comisión por venta según reglas CONFIGURABLES. Es la ÚNICA fuente
// de cálculo: Pantalla, Excel y PDF consumen este mismo motor → §21.
//
// Base comisionable = subtotal − descuento (antes de ITBIS). Ver
// docs/reports/COMISION_VENTAS_RULES.md.

import type { Proforma } from "@/types";
import {
  filterSales,
  paymentMethodGroup,
  saleDateKey,
  saleMethodSummary,
  saleStatusKey,
  comprobanteNumber,
  comprobanteLabel,
  PAYMENT_GROUP_LABEL,
  SALE_METHOD_LABEL,
  type PaymentGroup,
  type SaleMethodSummary,
  type SalesReportFilters,
} from "@/features/sales/sales-report";
import {
  DEFAULT_COMMISSION_RULES,
  type CommissionRule,
} from "./commission-rules";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Descuento global de la venta (mismo criterio que el Reporte de Ventas). */
function saleDiscount(p: Proforma): number {
  return p.discount || p.discountAmount || 0;
}

// ─── Estados ─────────────────────────────────────────────────────────────────

/** Estado de comisión de una venta. */
export type CommissionStatus =
  | "commissionable" // aplica una regla
  | "excluded" // exclusión manual (config/DB)
  | "cancelled" // venta anulada
  | "no_rule"; // ningún método/regla aplica

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  commissionable: "Pendiente",
  excluded: "Excluida",
  cancelled: "Anulada",
  no_rule: "Sin regla",
};

/** Estado de PAGO de la comisión (Fase 2: persistido en DB). */
export type PayoutStatus = "pending" | "approved" | "paid" | "voided" | "adjusted";

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  paid: "Pagada",
  voided: "Anulada",
  adjusted: "Ajustada",
};

// ─── Resolución de regla ─────────────────────────────────────────────────────

const PAYMENT_GROUPS: ReadonlySet<string> = new Set(["cash", "card", "transfer", "other"]);
function isPaymentGroup(g: SaleMethodSummary): g is PaymentGroup {
  return PAYMENT_GROUPS.has(g);
}

export interface RuleContext {
  branchId?: string;
  sellerId?: string;
  /** YYYY-MM-DD de la venta (para vigencia de la regla). */
  date?: string;
}

/** Elige la regla ACTIVA de mayor prioridad que matchea. `null` si ninguna. */
export function resolveCommissionRule(
  group: SaleMethodSummary,
  ctx: RuleContext,
  rules: CommissionRule[] = DEFAULT_COMMISSION_RULES,
): CommissionRule | null {
  const candidates = rules.filter((r) => {
    if (!r.active) return false;
    if (r.paymentGroups && !(isPaymentGroup(group) && r.paymentGroups.includes(group)))
      return false;
    if (r.branchId && r.branchId !== ctx.branchId) return false;
    if (r.sellerId && r.sellerId !== ctx.sellerId) return false;
    if (r.startsAt && ctx.date && ctx.date < r.startsAt) return false;
    if (r.endsAt && ctx.date && ctx.date > r.endsAt) return false;
    return true;
  });
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0] ?? null;
}

// ─── Línea de comisión (view-model, SIN ids internos visibles) ───────────────

export interface CommissionLine {
  /** id interno solo para keys de React / acciones — nunca se muestra. */
  id: string;
  date: string;
  comprobante: string;
  documentType: string;
  customer: string;
  seller: string;
  sellerId: string; // "__none__" si no hay vendedor
  cashier: string;
  branchId: string;
  branchName: string;
  methodGroup: SaleMethodSummary;
  methodLabel: string;
  subtotal: number;
  discount: number;
  /** base comisionable = subtotal − descuento (antes de ITBIS). */
  base: number;
  itbis: number;
  total: number;
  ruleId: string;
  ruleName: string;
  ratePercent: number;
  commission: number;
  /** Ajuste por devolución (negativo) sobre una comisión ya pagada. Opcional. */
  adjustment?: number;
  status: CommissionStatus;
  statusLabel: string;
  payout: PayoutStatus;
  payoutLabel: string;
}

export interface CommissionForSaleOptions {
  branchNames?: Map<string, string>;
  /** Estado de pago (Fase 2: desde DB). Default: "pending". */
  payoutByComprobante?: Map<string, PayoutStatus>;
  /** Motivo de exclusión manual por comprobante (para mostrarlo en la Regla). */
  exclusionReasons?: Map<string, string>;
}

/** Calcula la comisión de UNA venta. */
export function commissionForSale(
  p: Proforma,
  rules: CommissionRule[] = DEFAULT_COMMISSION_RULES,
  manualExclusions: ReadonlyArray<string> = [],
  options: CommissionForSaleOptions = {},
): CommissionLine {
  const discount = saleDiscount(p);
  const base = round2(p.subtotal - discount);
  const group = saleMethodSummary(p);
  const comprobante = comprobanteNumber(p);
  const sellerId = p.sellerId || "__none__";
  const branchName = options.branchNames?.get(p.branchId) ?? "Sucursal";
  const payout: PayoutStatus =
    options.payoutByComprobante?.get(comprobante) ?? "pending";

  const base_line = {
    id: p.id,
    date: p.createdAt,
    comprobante,
    documentType: comprobanteLabel(p),
    customer: p.customerName || "Consumidor final",
    seller: p.sellerName || (p.sellerId ? "Vendedor" : "No asignado"),
    sellerId,
    cashier: p.cashierName || "—",
    branchId: p.branchId,
    branchName,
    methodGroup: group,
    methodLabel: SALE_METHOD_LABEL[group],
    subtotal: round2(p.subtotal),
    discount: round2(discount),
    base,
    itbis: round2(p.itbis),
    total: round2(p.total),
    payout,
    payoutLabel: PAYOUT_STATUS_LABEL[payout],
  };

  const finalize = (
    status: CommissionStatus,
    ruleId: string,
    ruleName: string,
    ratePercent: number,
    commission: number,
  ): CommissionLine => ({
    ...base_line,
    ruleId,
    ruleName,
    ratePercent,
    commission,
    status,
    statusLabel: COMMISSION_STATUS_LABEL[status],
  });

  if (saleStatusKey(p.status) === "cancelled")
    return finalize("cancelled", "", "—", 0, 0);
  if (manualExclusions.includes(comprobante)) {
    const reason = options.exclusionReasons?.get(comprobante);
    return finalize("excluded", "", reason ? `Exclusión manual: ${reason}` : "Exclusión manual", 0, 0);
  }

  const rule = resolveCommissionRule(
    group,
    { branchId: p.branchId, sellerId: p.sellerId, date: saleDateKey(p.createdAt) },
    rules,
  );
  if (!rule) return finalize("no_rule", "", "Sin regla", 0, 0);

  const commission = round2((base * rule.percentage) / 100);
  return finalize("commissionable", rule.id, rule.name, rule.percentage, commission);
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

export interface CommissionFilters extends SalesReportFilters {
  /** Filtra por estado de comisión. */
  commissionStatus?: CommissionStatus | "";
  /** Filtra por regla aplicada. */
  ruleId?: string;
  /** Busca por número de comprobante (NCF/e-NCF). */
  comprobanteQuery?: string;
}

// ─── KPIs y desgloses ────────────────────────────────────────────────────────

export interface CommissionKpis {
  commissionableSales: number;
  commissionableBase: number;
  commission3: number;
  commission1: number;
  otherCommission: number;
  commissionTotal: number;
  excludedSales: number;
  pendingCommission: number;
  paidCommission: number;
  /** Ajustes por devolución (negativos). Opcional (fuente snapshot). */
  adjustments?: number;
  /** Neto = total + ajustes. Opcional. */
  netCommission?: number;
}

export interface SellerCommissionRow {
  sellerId: string;
  sellerName: string;
  sales: number;
  base: number;
  commission3: number;
  commission1: number;
  otherIncentives: number;
  commissionTotal: number;
  paid: number;
  pending: number;
}

export interface MethodCommissionRow {
  group: PaymentGroup | "mixed" | "none";
  label: string;
  sales: number;
  base: number;
  ratePercent: number;
  commission: number;
}

export interface BranchCommissionRow {
  branchId: string;
  branchName: string;
  sales: number;
  base: number;
  commission: number;
  paid: number;
  pending: number;
}

export interface CommissionReport {
  rows: CommissionLine[];
  kpis: CommissionKpis;
  bySeller: SellerCommissionRow[];
  byMethod: MethodCommissionRow[];
  byBranch: BranchCommissionRow[];
}

export interface BuildCommissionReportOptions extends CommissionForSaleOptions {
  manualExclusions?: ReadonlyArray<string>;
}

function computeKpis(lines: CommissionLine[]): CommissionKpis {
  const k: CommissionKpis = {
    commissionableSales: 0,
    commissionableBase: 0,
    commission3: 0,
    commission1: 0,
    otherCommission: 0,
    commissionTotal: 0,
    excludedSales: 0,
    pendingCommission: 0,
    paidCommission: 0,
  };
  for (const l of lines) {
    if (l.status !== "commissionable") {
      k.excludedSales += 1;
      continue;
    }
    k.commissionableSales += 1;
    k.commissionableBase += l.base;
    k.commissionTotal += l.commission;
    if (l.ratePercent === 3) k.commission3 += l.commission;
    else if (l.ratePercent === 1) k.commission1 += l.commission;
    else k.otherCommission += l.commission;
    if (l.payout === "paid") k.paidCommission += l.commission;
    else k.pendingCommission += l.commission;
  }
  return {
    commissionableSales: k.commissionableSales,
    commissionableBase: round2(k.commissionableBase),
    commission3: round2(k.commission3),
    commission1: round2(k.commission1),
    otherCommission: round2(k.otherCommission),
    commissionTotal: round2(k.commissionTotal),
    excludedSales: k.excludedSales,
    pendingCommission: round2(k.pendingCommission),
    paidCommission: round2(k.paidCommission),
  };
}

function computeBySeller(lines: CommissionLine[]): SellerCommissionRow[] {
  const acc = new Map<string, SellerCommissionRow>();
  for (const l of lines) {
    if (l.status !== "commissionable") continue;
    const row =
      acc.get(l.sellerId) ??
      acc
        .set(l.sellerId, {
          sellerId: l.sellerId,
          sellerName: l.seller,
          sales: 0,
          base: 0,
          commission3: 0,
          commission1: 0,
          otherIncentives: 0,
          commissionTotal: 0,
          paid: 0,
          pending: 0,
        })
        .get(l.sellerId)!;
    row.sales += 1;
    row.base += l.base;
    row.commissionTotal += l.commission;
    if (l.ratePercent === 3) row.commission3 += l.commission;
    else if (l.ratePercent === 1) row.commission1 += l.commission;
    if (l.payout === "paid") row.paid += l.commission;
    else row.pending += l.commission;
  }
  return [...acc.values()]
    .map((r) => ({
      ...r,
      base: round2(r.base),
      commission3: round2(r.commission3),
      commission1: round2(r.commission1),
      commissionTotal: round2(r.commissionTotal),
      paid: round2(r.paid),
      pending: round2(r.pending),
    }))
    .sort((a, b) => b.commissionTotal - a.commissionTotal);
}

function computeByMethod(lines: CommissionLine[]): MethodCommissionRow[] {
  const order: PaymentGroup[] = ["cash", "card", "transfer", "other"];
  const acc = new Map<string, { sales: number; base: number; commission: number }>();
  for (const l of lines) {
    if (l.status !== "commissionable") continue;
    const g = isPaymentGroup(l.methodGroup) ? l.methodGroup : "other";
    const row = acc.get(g) ?? { sales: 0, base: 0, commission: 0 };
    row.sales += 1;
    row.base += l.base;
    row.commission += l.commission;
    acc.set(g, row);
  }
  return order
    .filter((g) => acc.has(g))
    .map((g) => {
      const r = acc.get(g)!;
      return {
        group: g,
        label: PAYMENT_GROUP_LABEL[g],
        sales: r.sales,
        base: round2(r.base),
        ratePercent: r.base > 0 ? round2((r.commission / r.base) * 100) : 0,
        commission: round2(r.commission),
      };
    });
}

function computeByBranch(lines: CommissionLine[]): BranchCommissionRow[] {
  const acc = new Map<string, BranchCommissionRow>();
  for (const l of lines) {
    if (l.status !== "commissionable") continue;
    const row =
      acc.get(l.branchId) ??
      acc
        .set(l.branchId, {
          branchId: l.branchId,
          branchName: l.branchName,
          sales: 0,
          base: 0,
          commission: 0,
          paid: 0,
          pending: 0,
        })
        .get(l.branchId)!;
    row.sales += 1;
    row.base += l.base;
    row.commission += l.commission;
    if (l.payout === "paid") row.paid += l.commission;
    else row.pending += l.commission;
  }
  return [...acc.values()]
    .map((r) => ({
      ...r,
      base: round2(r.base),
      commission: round2(r.commission),
      paid: round2(r.paid),
      pending: round2(r.pending),
    }))
    .sort((a, b) => b.commission - a.commission);
}

/** Construye el informe completo de comisiones a partir de las ventas reales. */
export function buildCommissionReport(
  sales: Proforma[],
  filters: CommissionFilters,
  rules: CommissionRule[] = DEFAULT_COMMISSION_RULES,
  options: BuildCommissionReportOptions = {},
): CommissionReport {
  const filtered = filterSales(sales, filters);
  let lines = filtered.map((p) =>
    commissionForSale(p, rules, options.manualExclusions ?? [], {
      branchNames: options.branchNames,
      payoutByComprobante: options.payoutByComprobante,
      exclusionReasons: options.exclusionReasons,
    }),
  );
  if (filters.commissionStatus)
    lines = lines.filter((l) => l.status === filters.commissionStatus);
  if (filters.ruleId) lines = lines.filter((l) => l.ruleId === filters.ruleId);
  if (filters.comprobanteQuery) {
    const q = filters.comprobanteQuery.trim().toLowerCase();
    if (q) lines = lines.filter((l) => l.comprobante.toLowerCase().includes(q));
  }

  // Orden por defecto: fecha descendente.
  lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    rows: lines,
    kpis: computeKpis(lines),
    bySeller: computeBySeller(lines),
    byMethod: computeByMethod(lines),
    byBranch: computeByBranch(lines),
  };
}
