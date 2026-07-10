/**
 * CAPA CENTRAL de comisiones / incentivos — fuente ÚNICA de agregación.
 *
 * Regla de oro de la unificación (ver docs/reports/UNIFICACION_INCENTIVOS_COMISION.md):
 * TANTO "Ventas > Incentivos" COMO "Reportes > Comisión ventas" derivan sus
 * KPIs y su ranking por vendedor de los MISMOS snapshots `sales_incentives`
 * (`IncentiveRecord[]`) a través de estas funciones. Nadie recalcula por su
 * cuenta → los importes, el vendedor y el estado coinciden en ambos módulos por
 * construcción.
 *
 * Puro (sin React/DOM/red). No toca DGII real.
 */

import type { IncentiveRecord } from "@/features/incentives/incentive-store";
import { rankSellers, summarize } from "@/features/incentives/incentive-report";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─── Estados canónicos únicos (§10) ──────────────────────────────────────────
// pending · approved · paid · adjusted · voided (se acepta "void" legacy).
const ANULADO = new Set(["void", "voided"]);
const PENDIENTE = new Set(["pending", "approved"]);

/** ¿La línea cuenta para totales? (todo lo no anulado). */
export function isLiveIncentive(i: Pick<IncentiveRecord, "status">): boolean {
  return !ANULADO.has(i.status);
}
/** ¿La línea está pendiente de pago? (pending o approved). */
export function isPendingIncentive(i: Pick<IncentiveRecord, "status">): boolean {
  return PENDIENTE.has(i.status);
}
/** ¿La línea está pagada? */
export function isPaidIncentive(i: Pick<IncentiveRecord, "status">): boolean {
  return i.status === "paid";
}

// ─── Resumen central (KPIs) ──────────────────────────────────────────────────

export interface CommissionSummary {
  /** Ventas distintas que generaron comisión (no anuladas). */
  commissionableSales: number;
  /** Base comisionable total (neto pre-ITBIS, post-descuento). */
  commissionableBase: number;
  /** Comisión total generada (no anulada). */
  commissionTotal: number;
  /** Pendiente de pago (pending + approved). */
  pendingCommission: number;
  /** Pagada. */
  paidCommission: number;
  /** Ajustes acumulados (devoluciones sobre comisiones ya pagadas). */
  adjustments: number;
  /** Neto = total + ajustes (los ajustes son negativos). */
  netCommission: number;
  /** Desglose por regla aplicada (reemplaza el 3%/1% hardcodeado). */
  byRule: { ruleId: string; ruleName: string; amount: number }[];
}

/**
 * KPIs de comisión a partir de los snapshots. Fuente única para las tarjetas de
 * ambos módulos.
 */
export function getCommissionSummary(records: IncentiveRecord[]): CommissionSummary {
  const live = records.filter(isLiveIncentive);
  const saleIds = new Set(live.map((i) => i.saleId));

  let base = 0;
  let total = 0;
  let pending = 0;
  let paid = 0;
  let adjustments = 0;
  const ruleAcc = new Map<string, { ruleName: string; amount: number }>();

  for (const i of live) {
    base += i.baseAmount;
    total += i.incentiveAmount;
    if (isPaidIncentive(i)) paid += i.incentiveAmount;
    if (isPendingIncentive(i)) pending += i.incentiveAmount;
    // `adjustment_amount` llega en fases posteriores; se lee de forma segura.
    const adj = (i as { adjustmentAmount?: number }).adjustmentAmount ?? 0;
    adjustments += adj;

    const key = i.ruleId ?? "__none__";
    const acc = ruleAcc.get(key) ?? {
      ruleName: i.ruleName ?? "Sin regla",
      amount: 0,
    };
    acc.amount += i.incentiveAmount;
    ruleAcc.set(key, acc);
  }

  return {
    commissionableSales: saleIds.size,
    commissionableBase: round2(base),
    commissionTotal: round2(total),
    pendingCommission: round2(pending),
    paidCommission: round2(paid),
    adjustments: round2(adjustments),
    netCommission: round2(total + adjustments),
    byRule: [...ruleAcc.entries()]
      .map(([ruleId, v]) => ({ ruleId, ruleName: v.ruleName, amount: round2(v.amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// ─── Resumen por vendedor (mismo ranking que Incentivos) ─────────────────────

export interface SellerCommissionRow {
  sellerId: string;
  sellerName: string;
  sales: number;
  commissionTotal: number;
  paid: number;
  pending: number;
}

/**
 * Ranking por vendedor. Envuelve `rankSellers` de Incentivos → el "Vendedor top"
 * de Incentivos y el "Resumen por vendedor" de Comisión salen de la MISMA
 * fuente (§14, §15). Sin cálculo independiente.
 */
export function getCommissionBySeller(records: IncentiveRecord[]): SellerCommissionRow[] {
  return rankSellers(records).map((r) => ({
    sellerId: r.sellerId,
    sellerName: r.sellerName,
    sales: r.sales,
    commissionTotal: r.generated,
    paid: r.paid,
    pending: r.pending,
  }));
}

/** Vendedor top (nombre) — única fuente para el KPI de Incentivos. */
export function getTopSeller(records: IncentiveRecord[]): string | null {
  return summarize(records).topSeller;
}

// ─── Filtros canónicos compartidos (§13) ─────────────────────────────────────

export interface CommissionFilters {
  sellerId?: string;
  status?: IncentiveRecord["status"] | "all";
  from?: string; // YYYY-MM-DD (earnedAt)
  to?: string;
  ruleId?: string;
  branchId?: string;
}

/** Aplica los filtros canónicos a los snapshots (misma semántica en ambos módulos). */
export function applyCommissionFilters(
  records: IncentiveRecord[],
  f: CommissionFilters,
): IncentiveRecord[] {
  return records.filter((i) => {
    if (f.sellerId && (i.sellerId ?? "__none__") !== f.sellerId) return false;
    if (f.status && f.status !== "all" && i.status !== f.status) return false;
    if (f.ruleId && i.ruleId !== f.ruleId) return false;
    if (f.branchId && i.saleBranchId !== f.branchId) return false;
    if (f.from && i.earnedAt.slice(0, 10) < f.from) return false;
    if (f.to && i.earnedAt.slice(0, 10) > f.to) return false;
    return true;
  });
}
