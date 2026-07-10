/**
 * Adaptador: construye el `CommissionReport` (KPIs, por vendedor/método/sucursal
 * y detalle) que consumen la pantalla, el Excel y el PDF de Comisión ventas —
 * pero a partir de los SNAPSHOTS `sales_incentives` (fuente canónica), no de un
 * recálculo dinámico. Enriquece cada snapshot con su venta para el comprobante,
 * cliente, método, subtotal e ITBIS.
 *
 * Así el reporte de Comisión y la pantalla de Incentivos muestran EXACTAMENTE lo
 * mismo (mismo importe, vendedor, regla y estado) porque leen la misma tabla.
 * Puro (sin React/DOM/red). No toca DGII real.
 */

import type { Proforma } from "@/types";
import type { IncentiveRecord } from "@/features/incentives/incentive-store";
import {
  comprobanteNumber,
  comprobanteLabel,
  saleMethodSummary,
  saleDateKey,
  SALE_METHOD_LABEL,
  PAYMENT_GROUP_LABEL,
  type PaymentGroup,
  type SaleMethodSummary,
} from "@/features/sales/sales-report";
import {
  COMMISSION_STATUS_LABEL,
  PAYOUT_STATUS_LABEL,
  type CommissionFilters,
  type CommissionLine,
  type CommissionReport,
  type CommissionKpis,
  type SellerCommissionRow,
  type MethodCommissionRow,
  type BranchCommissionRow,
  type PayoutStatus,
} from "@/features/reports/commission/commission-engine";
import { isLiveIncentive } from "./central";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const PAYMENT_GROUPS: ReadonlySet<string> = new Set(["cash", "card", "transfer", "other"]);
function isPaymentGroup(g: SaleMethodSummary): g is PaymentGroup {
  return PAYMENT_GROUPS.has(g);
}

/** Estado de pago del snapshot → estado de pago del reporte. */
function toPayout(status: IncentiveRecord["status"]): PayoutStatus {
  if (status === "void" || status === "voided") return "voided";
  if (status === "approved") return "approved";
  if (status === "paid") return "paid";
  if (status === "adjusted") return "adjusted";
  return "pending";
}

/** Enriquecer un snapshot con su venta → línea de comisión. */
function toLine(
  i: IncentiveRecord,
  sale: Proforma | undefined,
  branchNames?: Map<string, string>,
  payoutByComprobante?: Map<string, PayoutStatus>,
): CommissionLine {
  const group: SaleMethodSummary = sale ? saleMethodSummary(sale) : "none";
  const base = round2(i.baseAmount);
  const commission = round2(i.incentiveAmount);
  const ratePercent = base > 0 ? round2((commission / base) * 100) : 0;
  const branchId = i.saleBranchId ?? sale?.branchId ?? "";
  const comprobante = sale ? comprobanteNumber(sale) : i.saleNumber ?? "—";
  // El estado de pago viene del store de payouts por comprobante (flujo actual
  // de la página) si existe; si no, del estado del snapshot.
  const payout = payoutByComprobante?.get(comprobante) ?? toPayout(i.status);
  return {
    id: i.id,
    date: i.earnedAt || sale?.createdAt || "",
    comprobante,
    documentType: sale ? comprobanteLabel(sale) : "—",
    customer: i.saleCustomer || sale?.customerName || "Consumidor final",
    seller: i.sellerName || "No asignado",
    sellerId: i.sellerId ?? "__none__",
    cashier: i.saleCashier || sale?.cashierName || "—",
    branchId,
    branchName: branchNames?.get(branchId) ?? "Sucursal",
    methodGroup: group,
    methodLabel: SALE_METHOD_LABEL[group],
    subtotal: round2(sale?.subtotal ?? base),
    discount: round2(sale?.discount ?? 0),
    base,
    itbis: round2(sale?.itbis ?? 0),
    total: round2(sale?.total ?? 0),
    ruleId: i.ruleId ?? "",
    ruleName: i.ruleName ?? "—",
    ratePercent,
    commission,
    adjustment: round2(i.adjustmentAmount ?? 0),
    // Los snapshots existen porque una regla aplicó → siempre comisionables.
    status: "commissionable",
    statusLabel: COMMISSION_STATUS_LABEL.commissionable,
    payout,
    payoutLabel: PAYOUT_STATUS_LABEL[payout],
  };
}

// ─── Filtros (mismos parámetros canónicos que el resto del reporte) ──────────

function passesFilters(l: CommissionLine, f: CommissionFilters): boolean {
  const day = saleDateKey(l.date);
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  if (f.branchId && l.branchId !== f.branchId) return false;
  if (f.method && l.methodGroup !== f.method) return false;
  if (f.sellerId && l.sellerId !== f.sellerId) return false;
  if (f.cashierId && l.cashier !== f.cashierId) {
    // cashierId es un id; la línea guarda el nombre. Se filtra abajo por sale.
  }
  if (f.ruleId && l.ruleId !== f.ruleId) return false;
  if (f.comprobanteQuery) {
    const q = f.comprobanteQuery.trim().toLowerCase();
    if (q && !l.comprobante.toLowerCase().includes(q)) return false;
  }
  if (f.customerQuery) {
    const q = f.customerQuery.trim().toLowerCase();
    if (q && !l.customer.toLowerCase().includes(q)) return false;
  }
  return true;
}

// ─── Agregados (misma forma que el motor dinámico, ahora desde snapshots) ────

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
  const sales = new Set<string>();
  let adjustments = 0;
  for (const l of lines) {
    sales.add(l.comprobante || l.id);
    k.commissionableBase += l.base;
    k.commissionTotal += l.commission;
    adjustments += l.adjustment ?? 0;
    if (l.ratePercent === 3) k.commission3 += l.commission;
    else if (l.ratePercent === 1) k.commission1 += l.commission;
    else k.otherCommission += l.commission;
    // 'adjusted'/'voided' no son ni pendiente ni pagado (ya se saldaron/revirtieron).
    if (l.payout === "paid") k.paidCommission += l.commission;
    else if (l.payout === "pending" || l.payout === "approved")
      k.pendingCommission += l.commission;
  }
  const commissionTotal = round2(k.commissionTotal);
  const adj = round2(adjustments);
  return {
    commissionableSales: sales.size,
    commissionableBase: round2(k.commissionableBase),
    commission3: round2(k.commission3),
    commission1: round2(k.commission1),
    otherCommission: round2(k.otherCommission),
    commissionTotal,
    excludedSales: 0,
    pendingCommission: round2(k.pendingCommission),
    paidCommission: round2(k.paidCommission),
    adjustments: adj,
    netCommission: round2(commissionTotal + adj),
  };
}

interface SellerAcc extends SellerCommissionRow {
  saleKeys: Set<string>;
}

function computeBySeller(lines: CommissionLine[]): SellerCommissionRow[] {
  const acc = new Map<string, SellerAcc>();
  for (const l of lines) {
    let r = acc.get(l.sellerId);
    if (!r) {
      r = {
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
        saleKeys: new Set<string>(),
      };
      acc.set(l.sellerId, r);
    }
    r.saleKeys.add(l.comprobante || l.id);
    r.base += l.base;
    r.commissionTotal += l.commission;
    if (l.ratePercent === 3) r.commission3 += l.commission;
    else if (l.ratePercent === 1) r.commission1 += l.commission;
    else r.otherIncentives += l.commission;
    if (l.payout === "paid") r.paid += l.commission;
    else r.pending += l.commission;
  }
  return [...acc.values()]
    .map(({ saleKeys, ...r }) => ({
      ...r,
      sales: saleKeys.size,
      base: round2(r.base),
      commission3: round2(r.commission3),
      commission1: round2(r.commission1),
      otherIncentives: round2(r.otherIncentives),
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

export interface ReportFromIncentivesOptions {
  branchNames?: Map<string, string>;
  /** Filtro por cajero (id): se resuelve con la venta. */
  cashierNameById?: Map<string, string>;
  /** Estado de pago por comprobante (flujo de pagos actual de la página). */
  payoutByComprobante?: Map<string, PayoutStatus>;
  /** Comprobantes excluidos manualmente (no comisionan → se ocultan). */
  manualExclusions?: ReadonlyArray<string>;
}

/**
 * Construye el informe completo de Comisión ventas desde los snapshots
 * `sales_incentives`, enriquecidos con sus ventas. FUENTE ÚNICA compartida con
 * Ventas > Incentivos.
 */
export function commissionReportFromIncentives(
  incentives: IncentiveRecord[],
  salesById: Map<string, Proforma>,
  filters: CommissionFilters,
  options: ReportFromIncentivesOptions = {},
): CommissionReport {
  const cashierName =
    filters.cashierId && options.cashierNameById?.get(filters.cashierId);
  const excluded = new Set(options.manualExclusions ?? []);

  let lines = incentives
    .filter(isLiveIncentive)
    .map((i) =>
      toLine(i, salesById.get(i.saleId), options.branchNames, options.payoutByComprobante),
    )
    .filter((l) => !excluded.has(l.comprobante))
    .filter((l) => passesFilters(l, filters));

  // Filtro por cajero (nombre resuelto del id).
  if (cashierName) lines = lines.filter((l) => l.cashier === cashierName);

  lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    rows: lines,
    kpis: computeKpis(lines),
    bySeller: computeBySeller(lines),
    byMethod: computeByMethod(lines),
    byBranch: computeByBranch(lines),
  };
}
