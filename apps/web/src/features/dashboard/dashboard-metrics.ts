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

/**
 * 🔴 Cómo se llama una venta sin sucursal. Está aquí, en una constante, porque
 * la MISMA tarjeta del panel mezcla estas filas con las del histórico migrado,
 * que resuelve la base (`desglose_ventas_unificadas`, dimensión `sucursal`).
 * Si el SQL y este archivo se renombraran por separado, la tarjeta enseñaría
 * dos filas con el mismo significado y distinto nombre. `migracion-desglose.test.ts`
 * ata las dos copias.
 */
export const ETIQUETA_SIN_SUCURSAL = "Sin sucursal";

/**
 * Una sucursal en una gráfica: su nombre, su importe y —lo que importa— SU ID.
 *
 * 🔴 El id no es decorativo. La mitad migrada de esa misma tarjeta la agrupa la
 * base por `alegra_invoices.branch_id`, que referencia `public.branches(id)`.
 * Mientras esto devolvió solo `{label, value}`, el panel clavaba su mitad por
 * NOMBRE y la de Alegra por UUID: las dos mitades no se fundían nunca y Villa
 * Olga salía en DOS barras bajo una cabecera que decía «Suma las ventas del
 * sistema y el histórico migrado». Peor: el insight llegaba a nombrar líder a
 * la sucursal equivocada, porque leía la primera de unas filas partidas.
 */
export interface BranchValue extends LabeledValue {
  /** `branches.id`. El mismo espacio de ids que usa el histórico migrado. */
  id: string;
}

/** Ventas del mes agrupadas por sucursal (solo docs del set dado). */
export function salesByBranch(
  docs: Proforma[],
  branchName: (id: string) => string,
  ref: Date = new Date(),
): BranchValue[] {
  const acc = new Map<string, number>();
  for (const p of docs) {
    if (!sameMonth(p.createdAt, ref)) continue;
    acc.set(p.branchId, (acc.get(p.branchId) ?? 0) + p.total);
  }
  return [...acc.entries()]
    .map(([id, value]) => ({ id, label: branchName(id) || ETIQUETA_SIN_SUCURSAL, value }))
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

/**
 * 🔴 Los doce meses en español, abreviados. Exportados porque la BASE escribe
 * exactamente estos mismos nombres en la dimensión `mes` del desglose
 * (`20260907120000_desglose_ventas_sucursal_mes.sql`): la serie de tiempo del
 * panel mezcla los dos orígenes en los MISMOS cubos, y si una mitad dijera
 * «Sept» y la otra «Sep» habría dos cubos donde hay uno.
 */
export const MONTHS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

/** Un mes de la serie de tendencia: su clave ordenable y su etiqueta legible. */
export interface CuboMes {
  /** `YYYY-MM`. La MISMA clave que devuelve el desglose de la base. */
  clave: string;
  /** `Sep 2026`. Lo que se lee bajo el punto de la gráfica. */
  etiqueta: string;
}

/**
 * Clave `YYYY-MM` de una fecha. En hora LOCAL, igual que `sameMonth` y que el
 * resto de los cubos de esta gráfica: mezclar local y UTC partiría en dos el
 * mes de las ventas del último día.
 */
export function claveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Los últimos `months` meses (incluido el de `ref`), del más viejo al más
 * nuevo. Es la ÚNICA definición de los cubos de la tendencia: la usan tanto
 * `monthlyTrend` (la mitad del sistema) como la pantalla que pide la mitad
 * migrada a la base, para que las dos caigan en los mismos sitios.
 */
export function mesesDeLaTendencia(months = 6, ref: Date = new Date()): CuboMes[] {
  const out: CuboMes[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    // `getMonth()` siempre está entre 0 y 11: el `!` no oculta ningún caso.
    out.push({ clave: claveMes(m), etiqueta: `${MONTHS_ES[m.getMonth()]!} ${m.getFullYear()}` });
  }
  return out;
}

/** Total vendido por mes en los últimos `months` meses (incluye el actual). */
export function monthlyTrend(
  docs: Proforma[],
  months = 6,
  ref: Date = new Date(),
): LabeledValue[] {
  const acc = new Map<string, number>();
  for (const p of docs) {
    // Una fecha corrupta da una clave que no casa con ningún cubo y por tanto
    // no suma en ninguno — el mismo desenlace que tenía `sameMonth`.
    const clave = claveMes(new Date(p.createdAt));
    acc.set(clave, (acc.get(clave) ?? 0) + p.total);
  }
  return mesesDeLaTendencia(months, ref).map((m) => ({
    label: m.etiqueta,
    value: acc.get(m.clave) ?? 0,
  }));
}

export interface TopProductRow {
  /**
   * Id del producto. Es la MISMA clave con la que la base agrupa los renglones
   * migrados (`desglose_ventas_unificadas`, dimensión `producto`), y por eso el
   * panel puede fundir las dos mitades en una sola fila por producto. El `sku`
   * no vale para eso: el histórico de Alegra no lo trae.
   */
  productId: string;
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
        productId: it.productId, name: it.productName, sku: it.productSku, units: 0, total: 0,
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

/**
 * Lo mínimo que hace falta de un producto para titularlo. NO es
 * `TopProductRow`: los insights del panel se construyen sobre filas ya
 * FUNDIDAS (sistema + histórico migrado), que no tienen SKU porque el
 * histórico de Alegra no lo trae.
 */
export interface ProductoDestacado {
  name: string;
  total: number;
}

/** Insights simples del período, en lenguaje del negocio. */
export function buildInsights(input: {
  branchLeader?: LabeledValue;
  topProduct?: ProductoDestacado;
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
      // 🔴 Sin unidades a propósito. La fila puede venir del sistema (donde la
      // cantidad son unidades) o del histórico migrado (donde son RENGLONES de
      // factura: `alegra_invoice_items.quantity` es numeric(14,3) y redondear
      // unidades vendidas es mentir). Un titular no es sitio para explicar esa
      // diferencia, así que dice lo único que significa lo mismo en las dos
      // mitades: el dinero.
      detail: `${input.formatCurrency(input.topProduct.total)} en el período.`,
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
