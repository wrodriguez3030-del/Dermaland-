// Lógica PURA del reporte de ventas (Reportes > Ventas).
//
// Sin React ni DOM: toma la lista de documentos de venta (proformas/facturas)
// que ya vienen de Supabase y deriva filtros, KPIs y resúmenes. Testeable de
// forma aislada. NO toca DGII real, secuencias ni datos: solo lee y agrega.

import type { PaymentMethod, Proforma, ProformaStatus } from "@/types";
import { classifySaleDocument } from "./document-label";
import { collectConvertedSourceIds } from "@/features/customers/customer-purchases";

// ─── Método de pago: agrupación de alto nivel ────────────────────────────────

export type PaymentGroup = "cash" | "card" | "transfer" | "other";

/** Etiquetas legibles de cada grupo de método de pago. */
export const PAYMENT_GROUP_LABEL: Record<PaymentGroup, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro",
};

/** Mapea un método de pago concreto a su grupo de alto nivel. */
export function paymentMethodGroup(method: PaymentMethod): PaymentGroup {
  switch (method) {
    case "cash":
      return "cash";
    case "card":
    case "azul":
    case "cardnet":
    case "visanet":
      return "card";
    case "transfer":
      return "transfer";
    default:
      return "other";
  }
}

/** Resumen del método de pago de UNA venta: un grupo, "mixed" o "none". */
export type SaleMethodSummary = PaymentGroup | "mixed" | "none";

export const SALE_METHOD_LABEL: Record<SaleMethodSummary, string> = {
  ...PAYMENT_GROUP_LABEL,
  mixed: "Mixto",
  none: "—",
};

/**
 * Determina el método de pago de una venta a partir de sus pagos REALES:
 *  - sin pagos               → "none"
 *  - un solo grupo           → ese grupo (efectivo/tarjeta/transferencia/otro)
 *  - dos o más grupos        → "mixed"
 */
export function saleMethodSummary(p: Pick<Proforma, "payments">): SaleMethodSummary {
  const groups = new Set<PaymentGroup>();
  for (const pay of p.payments ?? []) {
    if (!pay || !(pay.amount > 0)) continue;
    groups.add(paymentMethodGroup(pay.method));
  }
  if (groups.size === 0) return "none";
  if (groups.size === 1) return [...groups][0]!;
  return "mixed";
}

// ─── Comprobante / tipo de documento ─────────────────────────────────────────

export type ComprobanteKey =
  | "proforma"
  | "b02"
  | "b01"
  | "e32"
  | "e31"
  | "nota_credito"
  | "nota_debito"
  | "other";

export const COMPROBANTE_LABEL: Record<ComprobanteKey, string> = {
  proforma: "Proforma",
  b02: "Factura de consumo (B02)",
  b01: "Crédito fiscal (B01)",
  e32: "Consumo e-CF (E32)",
  e31: "Crédito fiscal e-CF (E31)",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  other: "Otro comprobante",
};

type DocFields = Pick<Proforma, "documentKind" | "ecfType" | "ecfNumber">;

/**
 * Clave de comprobante para filtrar/agrupar, derivada SOLO de los campos que
 * persiste el POS (documentKind/ecfType/ecfNumber). No infiere nada fiscal.
 */
export function comprobanteKey(p: DocFields): ComprobanteKey {
  const cls = classifySaleDocument(p);
  if (cls === "proforma") return "proforma";
  if (cls === "ecf") return p.ecfType === "31" ? "e31" : "e32";
  // NCF tradicional: distinguir por prefijo del comprobante.
  const prefix = (p.ecfNumber ?? "").slice(0, 3).toUpperCase();
  if (prefix === "B01") return "b01";
  if (prefix === "B02") return "b02";
  if (prefix === "B04") return "nota_credito";
  if (prefix === "B03") return "nota_debito";
  return "other";
}

/** Etiqueta legible del comprobante de una venta. */
export function comprobanteLabel(p: DocFields): string {
  return COMPROBANTE_LABEL[comprobanteKey(p)];
}

/** Número visible del comprobante (NUNCA el id interno). */
export function comprobanteNumber(p: Pick<Proforma, "ecfNumber" | "number">): string {
  return p.ecfNumber ?? p.number ?? "";
}

// ─── Estado de la venta ──────────────────────────────────────────────────────

export type SaleStatusKey =
  | "paid"
  | "pending"
  | "cancelled"
  | "returned"
  | "partial";

export const SALE_STATUS_LABEL: Record<SaleStatusKey, string> = {
  paid: "Pagada",
  pending: "Pendiente",
  cancelled: "Anulada",
  returned: "Devuelta",
  partial: "Parcial",
};

export const SALE_STATUS_TONE: Record<
  SaleStatusKey,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  paid: "success",
  pending: "info",
  cancelled: "danger",
  returned: "warning",
  partial: "warning",
};

/** Normaliza el `ProformaStatus` interno a una clave de estado para la UI. */
export function saleStatusKey(status: ProformaStatus): SaleStatusKey {
  switch (status) {
    case "paid":
    case "converted_to_ecf":
      return "paid";
    case "partially_paid":
      return "partial";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

/** Una venta cancelada/anulada cuenta como devolución para los KPIs. */
function isCancelled(p: Pick<Proforma, "status">): boolean {
  return saleStatusKey(p.status) === "cancelled";
}

// ─── Fechas ──────────────────────────────────────────────────────────────────

/** Clave de día local (YYYY-MM-DD) de una venta, para filtrar y agrupar. */
export function saleDateKey(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hora local (00-23) de una venta, para la tendencia intradía. */
export function saleHour(value: string): number {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getHours();
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

export interface SalesReportFilters {
  /** YYYY-MM-DD inclusivo. Vacío = sin límite inferior. */
  from?: string;
  /** YYYY-MM-DD inclusivo. Vacío = sin límite superior. */
  to?: string;
  branchId?: string;
  method?: SaleMethodSummary | "";
  comprobante?: ComprobanteKey | "";
  status?: SaleStatusKey | "";
  cashierId?: string;
  /** Filtra por vendedor (users.id). "__none__" = sin vendedor asignado. */
  sellerId?: string;
  /** Busca en nombre, teléfono, documento (cédula/RNC) del cliente. */
  customerQuery?: string;
  /** Busca por producto vendido (nombre o SKU). */
  productQuery?: string;
  /** Incluir proformas además de facturas. Por defecto: false. */
  includeProformas?: boolean;
}

export const EMPTY_FILTERS: SalesReportFilters = {
  from: "",
  to: "",
  branchId: "",
  method: "",
  comprobante: "",
  status: "",
  cashierId: "",
  sellerId: "",
  customerQuery: "",
  productQuery: "",
  includeProformas: false,
};

function matchesCustomer(p: Proforma, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [p.customerName, p.customerPhone, p.customerDocument]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

function matchesProduct(p: Proforma, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (p.items ?? []).some(
    (it) =>
      it.productName.toLowerCase().includes(needle) ||
      it.productSku.toLowerCase().includes(needle),
  );
}

/**
 * Aplica todos los filtros a la lista de documentos de venta. Por defecto solo
 * muestra facturas (NCF/e-CF); las proformas se incluyen si `includeProformas`.
 */
export function filterSales(
  all: Proforma[],
  filters: SalesReportFilters,
): Proforma[] {
  const f = filters;
  return all.filter((p) => {
    const key = comprobanteKey(p);
    const isProforma = key === "proforma";
    if (isProforma && !f.includeProformas && !f.comprobante) return false;

    if (f.from) {
      const d = saleDateKey(p.createdAt);
      if (d && d < f.from) return false;
    }
    if (f.to) {
      const d = saleDateKey(p.createdAt);
      if (d && d > f.to) return false;
    }
    if (f.branchId && p.branchId !== f.branchId) return false;
    if (f.method && saleMethodSummary(p) !== f.method) return false;
    if (f.comprobante && key !== f.comprobante) return false;
    if (f.status && saleStatusKey(p.status) !== f.status) return false;
    if (f.cashierId && p.cashierId !== f.cashierId) return false;
    if (f.sellerId) {
      if (f.sellerId === "__none__") {
        if (p.sellerId) return false;
      } else if (p.sellerId !== f.sellerId) {
        return false;
      }
    }
    if (!matchesCustomer(p, f.customerQuery ?? "")) return false;
    if (!matchesProduct(p, f.productQuery ?? "")) return false;
    return true;
  });
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

export interface SalesKpis {
  totalBilled: number;
  itbis: number;
  transactions: number;
  items: number;
  avgTicket: number;
  distinctCustomers: number;
  discounts: number;
  refunds: number;
  net: number;
  /** Margen estimado si hay costos disponibles; null si no se puede calcular. */
  marginEstimate: number | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function saleItemsCount(p: Proforma): number {
  return (p.items ?? []).reduce((q, it) => q + it.quantity, 0);
}

function saleDiscount(p: Proforma): number {
  return p.discount || p.discountAmount || 0;
}

/**
 * Calcula los KPIs. Las ventas anuladas NO suman al facturado; se reportan como
 * devoluciones y se restan para el neto. `costByProductId` habilita el margen.
 */
export function computeSalesKpis(
  filtered: Proforma[],
  costByProductId?: Map<string, number>,
): SalesKpis {
  let totalBilled = 0;
  let itbis = 0;
  let items = 0;
  let transactions = 0;
  let discounts = 0;
  let refunds = 0;
  let marginAcc = 0;
  let hasCost = false;
  const customers = new Set<string>();

  for (const p of filtered) {
    if (isCancelled(p)) {
      refunds += p.total;
      continue;
    }
    totalBilled += p.total;
    itbis += p.itbis;
    items += saleItemsCount(p);
    transactions += 1;
    discounts += saleDiscount(p);
    customers.add(p.customerId || p.customerName || `anon-${p.id}`);

    if (costByProductId) {
      for (const it of p.items ?? []) {
        const cost = costByProductId.get(it.productId);
        if (cost != null) {
          hasCost = true;
          marginAcc += it.subtotal - cost * it.quantity;
        }
      }
    }
  }

  const net = totalBilled - refunds;
  return {
    totalBilled: round2(totalBilled),
    itbis: round2(itbis),
    transactions,
    items,
    avgTicket: transactions > 0 ? round2(totalBilled / transactions) : 0,
    distinctCustomers: customers.size,
    discounts: round2(discounts),
    refunds: round2(refunds),
    net: round2(net),
    marginEstimate: hasCost ? round2(marginAcc) : null,
  };
}

// ─── Resúmenes / desgloses ───────────────────────────────────────────────────

export interface MethodBreakdownRow {
  key: PaymentGroup;
  label: string;
  amount: number;
  /** Cantidad de PAGOS (líneas de pago) de este grupo. */
  count: number;
  /** Cantidad de VENTAS distintas que tuvieron al menos un pago de este grupo. */
  sales: number;
}

/**
 * Desglose por método de pago usando los PAGOS reales de cada venta (no el
 * resumen). Una venta con pago mixto suma a cada grupo que la compone, así que
 * la suma de `sales` puede superar el total de transacciones. Las ventas
 * anuladas se excluyen.
 */
export function byPaymentMethod(filtered: Proforma[]): MethodBreakdownRow[] {
  const acc: Record<PaymentGroup, { amount: number; count: number; sales: number }> = {
    cash: { amount: 0, count: 0, sales: 0 },
    card: { amount: 0, count: 0, sales: 0 },
    transfer: { amount: 0, count: 0, sales: 0 },
    other: { amount: 0, count: 0, sales: 0 },
  };
  for (const p of filtered) {
    if (isCancelled(p)) continue;
    const groupsInSale = new Set<PaymentGroup>();
    for (const pay of p.payments ?? []) {
      if (!pay || !(pay.amount > 0)) continue;
      const g = paymentMethodGroup(pay.method);
      acc[g].amount += pay.amount;
      acc[g].count += 1;
      groupsInSale.add(g);
    }
    for (const g of groupsInSale) acc[g].sales += 1;
  }
  return (Object.keys(acc) as PaymentGroup[]).map((k) => ({
    key: k,
    label: PAYMENT_GROUP_LABEL[k],
    amount: round2(acc[k].amount),
    count: acc[k].count,
    sales: acc[k].sales,
  }));
}

export interface SaleMethodPart {
  group: PaymentGroup;
  label: string;
  amount: number;
}

/**
 * Desglose de los pagos de UNA venta agrupados por método real, en orden
 * canónico (efectivo, tarjeta, transferencia, otro). Permite mostrar el detalle
 * "Mixto: Efectivo RD$X + Tarjeta RD$Y" sin acoplar el formateo a esta capa.
 */
export function saleMethodParts(p: Pick<Proforma, "payments">): SaleMethodPart[] {
  const order: PaymentGroup[] = ["cash", "card", "transfer", "other"];
  const acc = new Map<PaymentGroup, number>();
  for (const pay of p.payments ?? []) {
    if (!pay || !(pay.amount > 0)) continue;
    const g = paymentMethodGroup(pay.method);
    acc.set(g, (acc.get(g) ?? 0) + pay.amount);
  }
  return order
    .filter((g) => acc.has(g))
    .map((g) => ({ group: g, label: PAYMENT_GROUP_LABEL[g], amount: round2(acc.get(g)!) }));
}

export interface NamedTotalRow {
  id: string;
  name: string;
  transactions: number;
  total: number;
}

/** Ventas por sucursal (excluye anuladas). `branchNames` mapea id→nombre. */
export function byBranch(
  filtered: Proforma[],
  branchNames: Map<string, string>,
): NamedTotalRow[] {
  const acc = new Map<string, NamedTotalRow>();
  for (const p of filtered) {
    if (isCancelled(p)) continue;
    const id = p.branchId || "—";
    const row =
      acc.get(id) ??
      acc
        .set(id, {
          id,
          name: branchNames.get(id) ?? "Sucursal",
          transactions: 0,
          total: 0,
        })
        .get(id)!;
    row.transactions += 1;
    row.total += p.total;
  }
  return [...acc.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total);
}

/** Top cajeros/vendedores por monto (excluye anuladas). */
export function byCashier(filtered: Proforma[]): NamedTotalRow[] {
  const acc = new Map<string, NamedTotalRow>();
  for (const p of filtered) {
    if (isCancelled(p)) continue;
    const id = p.cashierId || p.cashierName || "—";
    const row =
      acc.get(id) ??
      acc
        .set(id, { id, name: p.cashierName || "Cajero", transactions: 0, total: 0 })
        .get(id)!;
    row.transactions += 1;
    row.total += p.total;
  }
  return [...acc.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total);
}

/** Ventas por VENDEDOR (excluye anuladas). Sin vendedor → "No asignado". */
export function bySeller(filtered: Proforma[]): NamedTotalRow[] {
  const acc = new Map<string, NamedTotalRow>();
  for (const p of filtered) {
    if (isCancelled(p)) continue;
    const id = p.sellerId || "__none__";
    const row =
      acc.get(id) ??
      acc
        .set(id, {
          id,
          name: p.sellerName || (p.sellerId ? "Vendedor" : "No asignado"),
          transactions: 0,
          total: 0,
        })
        .get(id)!;
    row.transactions += 1;
    row.total += p.total;
  }
  return [...acc.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total);
}

export interface ProductSalesRow {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  total: number;
  cost: number | null;
  margin: number | null;
}

/** Productos más vendidos (excluye anuladas). `costByProductId` opcional. */
export function topProducts(
  filtered: Proforma[],
  costByProductId?: Map<string, number>,
  limit?: number,
): ProductSalesRow[] {
  const acc = new Map<string, ProductSalesRow>();
  for (const p of filtered) {
    if (isCancelled(p)) continue;
    for (const it of p.items ?? []) {
      const row =
        acc.get(it.productId) ??
        acc
          .set(it.productId, {
            productId: it.productId,
            sku: it.productSku,
            name: it.productName,
            quantity: 0,
            total: 0,
            cost: null,
            margin: null,
          })
          .get(it.productId)!;
      row.quantity += it.quantity;
      row.total += it.total;
      const cost = costByProductId?.get(it.productId);
      if (cost != null) {
        row.cost = (row.cost ?? 0) + cost * it.quantity;
        row.margin = (row.margin ?? 0) + (it.subtotal - cost * it.quantity);
      }
    }
  }
  const rows = [...acc.values()]
    .map((r) => ({
      ...r,
      total: round2(r.total),
      cost: r.cost != null ? round2(r.cost) : null,
      margin: r.margin != null ? round2(r.margin) : null,
    }))
    .sort((a, b) => b.total - a.total);
  return limit ? rows.slice(0, limit) : rows;
}

export interface CustomerSalesRow {
  name: string;
  document: string;
  phone: string;
  purchases: number;
  total: number;
}

/**
 * Clientes principales por gasto (excluye anuladas). No cuenta dos veces una
 * proforma convertida en factura (enlace `sourceProformaId`) — misma regla
 * central que el perfil y el Reporte de Clientes.
 */
export function topCustomers(
  filtered: Proforma[],
  limit?: number,
): CustomerSalesRow[] {
  const convertedIds = collectConvertedSourceIds(filtered);
  const acc = new Map<string, CustomerSalesRow>();
  for (const p of filtered) {
    if (isCancelled(p)) continue;
    if (convertedIds.has(p.id)) continue;
    const key = p.customerId || p.customerName || "anon";
    const row =
      acc.get(key) ??
      acc
        .set(key, {
          name: p.customerName || "Consumidor final",
          document: p.customerDocument ?? "",
          phone: p.customerPhone ?? "",
          purchases: 0,
          total: 0,
        })
        .get(key)!;
    row.purchases += 1;
    row.total += p.total;
    if (!row.document && p.customerDocument) row.document = p.customerDocument;
    if (!row.phone && p.customerPhone) row.phone = p.customerPhone;
  }
  const rows = [...acc.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total);
  return limit ? rows.slice(0, limit) : rows;
}

export interface ComprobanteBreakdownRow {
  key: ComprobanteKey;
  label: string;
  count: number;
  total: number;
}

/** Conteo y monto por tipo de comprobante (incluye proformas si están). */
export function byComprobante(filtered: Proforma[]): ComprobanteBreakdownRow[] {
  const acc = new Map<ComprobanteKey, ComprobanteBreakdownRow>();
  for (const p of filtered) {
    const key = comprobanteKey(p);
    const row =
      acc.get(key) ??
      acc
        .set(key, { key, label: COMPROBANTE_LABEL[key], count: 0, total: 0 })
        .get(key)!;
    row.count += 1;
    if (!isCancelled(p)) row.total += p.total;
  }
  return [...acc.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total);
}

export interface TrendPoint {
  label: string;
  value: number;
}

/**
 * Tendencia de ventas. Si el rango es un único día (from===to) agrupa por hora;
 * en otro caso agrupa por día. Excluye anuladas.
 */
export function salesTrend(
  filtered: Proforma[],
  filters: Pick<SalesReportFilters, "from" | "to">,
): TrendPoint[] {
  const sameDay = !!filters.from && filters.from === filters.to;
  if (sameDay) {
    const hours = new Array(24).fill(0) as number[];
    for (const p of filtered) {
      if (isCancelled(p)) continue;
      const h = saleHour(p.createdAt);
      hours[h] = (hours[h] ?? 0) + p.total;
    }
    return hours.map((v, h) => ({
      label: `${String(h).padStart(2, "0")}:00`,
      value: round2(v),
    }));
  }
  const acc = new Map<string, number>();
  for (const p of filtered) {
    if (isCancelled(p)) continue;
    const d = saleDateKey(p.createdAt);
    acc.set(d, (acc.get(d) ?? 0) + p.total);
  }
  return [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([label, value]) => ({ label, value: round2(value) }));
}

// ─── Fila de tabla (view-model, SIN ids internos) ────────────────────────────

export interface SalesTableRow {
  id: string;
  dateTime: string;
  branchName: string;
  comprobante: string;
  documentType: string;
  customer: string;
  cashier: string;
  /** Vendedor responsable (snapshot) — requerido en el Excel de detalle. */
  seller: string;
  items: number;
  method: SaleMethodSummary;
  methodLabel: string;
  /** Pagos de la venta por método real (para el detalle "Mixto: …"). */
  methodParts: SaleMethodPart[];
  subtotal: number;
  itbis: number;
  discount: number;
  total: number;
  status: SaleStatusKey;
  statusLabel: string;
}

/**
 * Proyecta una venta a una fila de tabla con SOLO datos legibles: número de
 * comprobante (nunca el id interno), nombre de sucursal (no branch_id), etc.
 * `id` se conserva únicamente para keys de React y rutas de acción.
 */
export function toSalesTableRow(
  p: Proforma,
  branchNames: Map<string, string>,
): SalesTableRow {
  const status = saleStatusKey(p.status);
  const method = saleMethodSummary(p);
  return {
    id: p.id,
    dateTime: p.createdAt,
    branchName: branchNames.get(p.branchId) ?? "Sucursal",
    comprobante: comprobanteNumber(p),
    documentType: comprobanteLabel(p),
    customer: p.customerName || "Consumidor final",
    cashier: p.cashierName || "—",
    seller: p.sellerName || "—",
    items: saleItemsCount(p),
    method,
    methodLabel: SALE_METHOD_LABEL[method],
    methodParts: saleMethodParts(p),
    subtotal: round2(p.subtotal),
    itbis: round2(p.itbis),
    discount: round2(saleDiscount(p)),
    total: round2(p.total),
    status,
    statusLabel: SALE_STATUS_LABEL[status],
  };
}

// ─── Informe agregado ────────────────────────────────────────────────────────

export interface SalesReport {
  filtered: Proforma[];
  rows: SalesTableRow[];
  kpis: SalesKpis;
  methods: MethodBreakdownRow[];
  branches: NamedTotalRow[];
  cashiers: NamedTotalRow[];
  sellers: NamedTotalRow[];
  products: ProductSalesRow[];
  customers: CustomerSalesRow[];
  comprobantes: ComprobanteBreakdownRow[];
  trend: TrendPoint[];
}

export interface BuildSalesReportOptions {
  branchNames?: Map<string, string>;
  costByProductId?: Map<string, number>;
}

/** Construye el informe completo: filtra, calcula KPIs y todos los resúmenes. */
export function buildSalesReport(
  all: Proforma[],
  filters: SalesReportFilters,
  options: BuildSalesReportOptions = {},
): SalesReport {
  const branchNames = options.branchNames ?? new Map<string, string>();
  const cost = options.costByProductId;
  const filtered = filterSales(all, filters);
  return {
    filtered,
    rows: filtered.map((p) => toSalesTableRow(p, branchNames)),
    kpis: computeSalesKpis(filtered, cost),
    methods: byPaymentMethod(filtered),
    branches: byBranch(filtered, branchNames),
    cashiers: byCashier(filtered),
    sellers: bySeller(filtered),
    products: topProducts(filtered, cost),
    customers: topCustomers(filtered),
    comprobantes: byComprobante(filtered),
    trend: salesTrend(filtered, filters),
  };
}

// ─── Rangos rápidos ──────────────────────────────────────────────────────────

export type QuickRangeKey =
  | "today"
  | "yesterday"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "all";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calcula {from,to} para un rango rápido, relativo a `now` (default hoy). */
export function quickRange(
  key: QuickRangeKey,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today":
      return { from: ymd(today), to: ymd(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: ymd(y), to: ymd(y) };
    }
    case "last7": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: ymd(from), to: ymd(today) };
    }
    case "thisMonth": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: ymd(from), to: ymd(today) };
    }
    case "lastMonth": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: ymd(from), to: ymd(to) };
    }
    case "all":
    default:
      return { from: "", to: "" };
  }
}
