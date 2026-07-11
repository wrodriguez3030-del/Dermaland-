import type { Proforma } from "@/types";

/**
 * Métricas PURAS del dashboard ejecutivo (sin React ni DOM → testeables).
 * Todas operan sobre las mismas proformas/facturas que ven las pantallas de
 * detalle, para que cada gráfico cuadre con su "Ver detalle →".
 */

export interface LabeledValue {
  label: string;
  value: number;
}

/** ¿La fecha cae dentro del mes calendario de `ref`? */
function sameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

/** Ventas del mes agrupadas por sucursal (solo docs del set dado). */
export function salesByBranch(
  docs: Proforma[],
  branchName: (id: string) => string,
  ref: Date = new Date(),
): LabeledValue[] {
  const acc = new Map<string, number>();
  for (const p of docs) {
    if (!sameMonth(p.createdAt, ref)) continue;
    acc.set(p.branchId, (acc.get(p.branchId) ?? 0) + p.total);
  }
  return [...acc.entries()]
    .map(([id, value]) => ({ label: branchName(id) || "Sin sucursal", value }))
    .sort((a, b) => b.value - a.value);
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  credit: "Crédito",
  other: "Otro",
};

/** Cobros del mes por método de pago (suma de payments de los docs dados). */
export function paymentsByMethod(
  docs: Proforma[],
  ref: Date = new Date(),
): LabeledValue[] {
  const acc = new Map<string, number>();
  for (const p of docs) {
    if (!sameMonth(p.createdAt, ref)) continue;
    for (const pay of p.payments ?? []) {
      const key = PAYMENT_METHOD_LABEL[pay.method] ?? pay.method;
      acc.set(key, (acc.get(key) ?? 0) + pay.amount);
    }
  }
  return [...acc.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Total vendido por mes en los últimos `months` meses (incluye el actual). */
export function monthlyTrend(
  docs: Proforma[],
  months = 6,
  ref: Date = new Date(),
): LabeledValue[] {
  const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const out: LabeledValue[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const total = docs
      .filter((p) => sameMonth(p.createdAt, m))
      .reduce((s, p) => s + p.total, 0);
    out.push({ label: `${MONTHS_ES[m.getMonth()]} ${m.getFullYear()}`, value: total });
  }
  return out;
}

export interface TopProductRow {
  name: string;
  sku: string;
  units: number;
  total: number;
}

/** Top-N productos del mes por monto vendido (desde los items). */
export function topProducts(
  docs: Proforma[],
  n = 5,
  ref: Date = new Date(),
): TopProductRow[] {
  const acc = new Map<string, TopProductRow>();
  for (const p of docs) {
    if (!sameMonth(p.createdAt, ref)) continue;
    for (const it of p.items ?? []) {
      const cur = acc.get(it.productId) ?? {
        name: it.productName, sku: it.productSku, units: 0, total: 0,
      };
      cur.units += it.quantity;
      cur.total += it.total;
      acc.set(it.productId, cur);
    }
  }
  return [...acc.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

export interface Insight {
  tone: "good" | "info" | "warn";
  title: string;
  detail: string;
}

/** Insights simples del período, en lenguaje del negocio. */
export function buildInsights(input: {
  branchLeader?: LabeledValue;
  topProduct?: TopProductRow;
  criticalExpiring: number; // lotes que vencen en <15 días
  lowStock: number;
  formatCurrency: (n: number) => string;
}): Insight[] {
  const out: Insight[] = [];
  if (input.branchLeader && input.branchLeader.value > 0) {
    out.push({
      tone: "good",
      title: `${input.branchLeader.label} lidera las ventas del mes`,
      detail: `Con ${input.formatCurrency(input.branchLeader.value)} facturado.`,
    });
  }
  if (input.topProduct) {
    out.push({
      tone: "info",
      title: `${input.topProduct.name} es el producto más vendido`,
      detail: `${input.topProduct.units} unidades · ${input.formatCurrency(input.topProduct.total)}.`,
    });
  }
  out.push(
    input.criticalExpiring > 0
      ? {
          tone: "warn",
          title: `${input.criticalExpiring} lote(s) vencen en menos de 15 días`,
          detail: "Prioriza su salida en POS (FEFO) o gestiona devolución.",
        }
      : { tone: "good", title: "Sin vencimientos críticos", detail: "Ningún lote vence en los próximos 15 días." },
  );
  out.push(
    input.lowStock > 0
      ? {
          tone: "warn",
          title: `${input.lowStock} producto(s) bajo stock mínimo`,
          detail: "Revisa el reorden en Inventario › Bajo stock.",
        }
      : { tone: "good", title: "Stock saludable", detail: "Ningún producto bajo el mínimo configurado." },
  );
  return out;
}
