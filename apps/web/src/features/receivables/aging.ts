/**
 * Antigüedad de cuentas por cobrar — lógica PURA compartida por dashboard,
 * pendientes, mora, calendario, reportes e IA (fuente única de buckets).
 *
 * Estados (spec del negocio):
 *   al_dia     → verde     (sin vencer, faltan > 7 días)
 *   por_vencer → amarillo  (vence en ≤ 7 días)
 *   v1_30      → naranja   (vencida 1-30 días)
 *   v31_60     → rojo      (vencida 31-60 días)
 *   v60        → rojo osc. (vencida más de 60 días)
 */
export type AgingBucket = "al_dia" | "por_vencer" | "v1_30" | "v31_60" | "v60";

export const AGING_ORDER: AgingBucket[] = ["al_dia", "por_vencer", "v1_30", "v31_60", "v60"];

export const AGING_LABEL: Record<AgingBucket, string> = {
  al_dia: "Al día",
  por_vencer: "Por vencer",
  v1_30: "Vencida 1-30",
  v31_60: "Vencida 31-60",
  v60: "Vencida +60",
};

/** Tono del Badge del design system para cada bucket. */
export const AGING_TONE: Record<AgingBucket, "success" | "warning" | "danger"> = {
  al_dia: "success",
  por_vencer: "warning",
  v1_30: "warning",
  v31_60: "danger",
  v60: "danger",
};

/** Clases extra para distinguir naranja (1-30) y rojo oscuro (+60). */
export const AGING_CLASS: Record<AgingBucket, string> = {
  al_dia: "",
  por_vencer: "",
  v1_30: "!bg-orange-100 !text-orange-800 !border-orange-200",
  v31_60: "",
  v60: "!bg-red-900 !text-red-50 !border-red-900",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_DAYS = 7;

/** Días de atraso (positivo = vencida); 0 o negativo = aún no vence. */
export function overdueDays(dueDate: string | null | undefined, todayIso: string): number {
  if (!dueDate) return 0;
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return 0;
  return Math.round((today - due) / DAY_MS);
}

/** Bucket de antigüedad. Sin due_date = al día (venta sin vencimiento fijado). */
export function agingBucket(dueDate: string | null | undefined, todayIso: string): AgingBucket {
  if (!dueDate) return "al_dia";
  const d = overdueDays(dueDate, todayIso);
  if (d > 60) return "v60";
  if (d > 30) return "v31_60";
  if (d > 0) return "v1_30";
  if (d >= -SOON_DAYS) return "por_vencer";
  return "al_dia";
}

export interface AgingTotals {
  count: Record<AgingBucket, number>;
  amount: Record<AgingBucket, number>;
  totalCount: number;
  totalAmount: number;
  /** Suma de buckets vencidos (v1_30 + v31_60 + v60). */
  overdueCount: number;
  overdueAmount: number;
}

/** Acumula facturas pendientes en buckets (para dashboard/reportes). */
export function computeAging(
  rows: { dueDate?: string | null; balance: number }[],
  todayIso: string,
): AgingTotals {
  const count = { al_dia: 0, por_vencer: 0, v1_30: 0, v31_60: 0, v60: 0 };
  const amount = { al_dia: 0, por_vencer: 0, v1_30: 0, v31_60: 0, v60: 0 };
  for (const r of rows) {
    const b = agingBucket(r.dueDate, todayIso);
    count[b] += 1;
    amount[b] = Math.round((amount[b] + r.balance) * 100) / 100;
  }
  const overdue: AgingBucket[] = ["v1_30", "v31_60", "v60"];
  return {
    count,
    amount,
    totalCount: rows.length,
    totalAmount: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100,
    overdueCount: overdue.reduce((s, b) => s + count[b], 0),
    overdueAmount: Math.round(overdue.reduce((s, b) => s + amount[b], 0) * 100) / 100,
  };
}

/** Hoy en fecha calendario de RD (YYYY-MM-DD). */
export function todayRD(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
}
