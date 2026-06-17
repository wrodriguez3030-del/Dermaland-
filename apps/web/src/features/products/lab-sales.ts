import type { Laboratory, Product, Proforma } from "@/types";

/**
 * Agregación de ventas por laboratorio (puro, testeable).
 *
 * Las ventas salen de las proformas/comprobantes: por cada ítem vendido se
 * busca el producto y su `laboratoryId`, y se suma el monto e unidades al
 * laboratorio correspondiente. Productos sin laboratorio se ignoran (no
 * rompen). Laboratorios sin ventas aparecen con 0.
 *
 * Respeta el scope del negocio porque opera sobre las proformas ya filtradas
 * por `business_id` (mismo tenant); admite filtros opcionales por sucursal y
 * rango de fechas.
 */

const SALE_STATUSES = new Set<Proforma["status"]>([
  "paid",
  "partially_paid",
  "issued",
  "pending_ecf",
  "converted_to_ecf",
]);

export interface LabSalesRow {
  lab: Laboratory;
  totalMoney: number;
  units: number;
  /** Ranking 1-based por monto vendido (desc). */
  rank: number;
  /** % del monto frente al laboratorio líder (0..100). */
  percentOfLeader: number;
}

export interface LabSalesFilters {
  branchId?: string;
  /** ISO date (inclusive). */
  from?: string;
  /** ISO date (inclusive). */
  to?: string;
}

export function computeLabSales(
  laboratories: Laboratory[],
  products: Product[],
  proformas: Proforma[],
  filters: LabSalesFilters = {},
): LabSalesRow[] {
  const productLab = new Map<string, string>();
  for (const p of products) {
    if (p.laboratoryId) productLab.set(p.id, p.laboratoryId);
  }

  const money = new Map<string, number>();
  const units = new Map<string, number>();
  for (const l of laboratories) {
    money.set(l.id, 0);
    units.set(l.id, 0);
  }

  const fromTs = filters.from ? new Date(filters.from).getTime() : -Infinity;
  const toTs = filters.to ? new Date(filters.to).getTime() + 86_399_999 : Infinity;

  for (const pf of proformas) {
    if (!SALE_STATUSES.has(pf.status)) continue;
    if (filters.branchId && pf.branchId !== filters.branchId) continue;
    const ts = new Date(pf.createdAt).getTime();
    if (ts < fromTs || ts > toTs) continue;
    for (const item of pf.items) {
      const labId = productLab.get(item.productId);
      if (!labId || !money.has(labId)) continue;
      money.set(labId, (money.get(labId) ?? 0) + (item.total || 0));
      units.set(labId, (units.get(labId) ?? 0) + (item.quantity || 0));
    }
  }

  const rows = laboratories
    .map((lab) => ({
      lab,
      totalMoney: money.get(lab.id) ?? 0,
      units: units.get(lab.id) ?? 0,
      rank: 0,
      percentOfLeader: 0,
    }))
    .sort(
      (a, b) =>
        b.totalMoney - a.totalMoney ||
        b.units - a.units ||
        a.lab.name.localeCompare(b.lab.name),
    );

  const leader = rows[0]?.totalMoney ?? 0;
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.percentOfLeader = leader > 0 ? Math.round((r.totalMoney / leader) * 100) : 0;
  });
  return rows;
}

export interface LabSalesSummary {
  leader?: LabSalesRow;
  totalLabs: number;
  totalMoney: number;
  totalUnits: number;
  top3: LabSalesRow[];
  hasSales: boolean;
}

export function summarizeLabSales(rows: LabSalesRow[]): LabSalesSummary {
  const totalMoney = rows.reduce((s, r) => s + r.totalMoney, 0);
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  return {
    leader: rows.find((r) => r.totalMoney > 0),
    totalLabs: rows.length,
    totalMoney,
    totalUnits,
    top3: rows.filter((r) => r.totalMoney > 0).slice(0, 3),
    hasSales: totalMoney > 0,
  };
}
