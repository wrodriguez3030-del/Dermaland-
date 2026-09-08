import type { Customer, Proforma } from "@/types";
import {
  collectConvertedSourceIds,
  computeCustomerPurchaseStats,
  type CustomerPurchaseStats,
} from "./customer-purchases";
import {
  normalizeDocument,
  normalizePhone,
} from "./customer-normalization";

/**
 * Métricas de clientes — capa CENTRAL de agregación (pura, sin I/O).
 *
 * Una sola fuente de cálculo para: perfil del cliente, listado de clientes,
 * Reporte de Clientes y endpoint `/api/customers/metrics`. El perfil calcula
 * `computeCustomerPurchaseStats` sobre las ventas del cliente; este módulo
 * aplica EXACTAMENTE la misma función por cliente en una sola pasada O(N+M)
 * (sin queries por cliente / sin N+1).
 *
 * Emparejamiento venta↔cliente = mismas reglas que `saleBelongsToCustomer`:
 *  1. `sale.customerId` (relación principal).
 *  2. Fallback para ventas legacy SIN customerId: documento normalizado,
 *     luego teléfono normalizado — solo si el match es ÚNICO (una venta
 *     ambigua entre 2+ clientes no se asigna; la resuelve el backfill).
 *  3. Walk-in sin datos no se asigna a nadie.
 */

export interface CustomerMetricsRow {
  /** Solo los campos que el listado usa — ver `ClienteDeListado` al final. */
  customer: ClienteDeListado;
  stats: CustomerPurchaseStats;
}

export interface SalesPeriodFilter {
  /** ISO date (inclusive) — filtra por fecha de la venta. */
  from?: string;
  /** ISO date (inclusive, fin de día). */
  to?: string;
  /** Sucursal específica; undefined = todas. */
  branchId?: string;
}

/** Filtra ventas por período/sucursal — compartido por perfil y reporte. */
export function filterSalesForPeriod(
  sales: Proforma[],
  filter: SalesPeriodFilter | undefined,
): Proforma[] {
  if (!filter || (!filter.from && !filter.to && !filter.branchId)) return sales;
  const fromTs = filter.from ? Date.parse(filter.from) : Number.NEGATIVE_INFINITY;
  // `to` inclusive hasta el fin del día (23:59:59.999).
  const toTs = filter.to
    ? Date.parse(filter.to) + 24 * 60 * 60 * 1000 - 1
    : Number.POSITIVE_INFINITY;
  return sales.filter((s) => {
    if (filter.branchId && s.branchId !== filter.branchId) return false;
    const ts = Date.parse(s.createdAt);
    return ts >= fromTs && ts <= toTs;
  });
}

/**
 * Agrupa ventas por cliente (una pasada) y calcula las métricas de cada uno
 * con la MISMA función del perfil. Devuelve una fila por cliente.
 */
export function computeCustomersReport(
  customers: Customer[],
  sales: Proforma[],
  filter?: SalesPeriodFilter,
): CustomerMetricsRow[] {
  const filtered = filterSalesForPeriod(sales, filter);
  // Los ids convertidos se calculan sobre TODAS las ventas filtradas (la
  // factura final puede estar en el período aunque la proforma origen no).
  const convertedIds = collectConvertedSourceIds(filtered);

  const byId = new Map<string, Customer>();
  const byDoc = new Map<string, Customer[]>();
  const byPhone = new Map<string, Customer[]>();
  for (const c of customers) {
    byId.set(c.id, c);
    const doc = normalizeDocument(c.documentNumber);
    if (doc) byDoc.set(doc, [...(byDoc.get(doc) ?? []), c]);
    const phone = normalizePhone(c.phone);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), c]);
  }

  const salesByCustomer = new Map<string, Proforma[]>();
  const push = (customerId: string, sale: Proforma) => {
    const list = salesByCustomer.get(customerId);
    if (list) list.push(sale);
    else salesByCustomer.set(customerId, [sale]);
  };

  for (const s of filtered) {
    if (s.customerId) {
      // Relación principal. Si el id no existe en clientes (huérfano), la
      // venta no se asigna — el script de auditoría los reporta.
      if (byId.has(s.customerId)) push(s.customerId, s);
      continue;
    }
    // Fallback legacy: documento → teléfono, solo con match único.
    const doc = normalizeDocument(s.customerDocument);
    if (doc) {
      const candidates = byDoc.get(doc);
      if (candidates?.length === 1) {
        push(candidates[0]!.id, s);
        continue;
      }
      if (candidates && candidates.length > 1) continue; // ambigua
    }
    const phone = normalizePhone(s.customerPhone);
    if (phone) {
      const candidates = byPhone.get(phone);
      if (candidates?.length === 1) push(candidates[0]!.id, s);
    }
    // Walk-in / sin datos → no se asigna.
  }

  return customers.map((customer) => ({
    customer,
    stats: computeCustomerPurchaseStats(
      salesByCustomer.get(customer.id) ?? [],
      convertedIds,
    ),
  }));
}

// ─── Clientes VIP — regla central configurable ──────────────────────────────

export interface VipRule {
  /** Etiqueta manual que marca VIP (regla vigente del negocio). */
  tag: string;
  /** Umbral de gasto acumulado (RD$) que otorga VIP automático; null = off. */
  minSpent: number | null;
  /** Cantidad de compras que otorga VIP automático; null = off. */
  minPurchases: number | null;
}

/**
 * Regla vigente: VIP = etiqueta manual "VIP". Los umbrales automáticos
 * quedan configurables aquí (un solo lugar) y apagados por defecto para no
 * cambiar la semántica del negocio sin decisión explícita.
 */
export const VIP_RULE: VipRule = {
  tag: "VIP",
  minSpent: null,
  minPurchases: null,
};

export function isVipCustomer(
  customer: Pick<Customer, "tags">,
  stats?: Pick<CustomerPurchaseStats, "totalSpent" | "purchases">,
  rule: VipRule = VIP_RULE,
): boolean {
  if (customer.tags?.includes(rule.tag)) return true;
  if (stats && rule.minSpent != null && stats.totalSpent >= rule.minSpent)
    return true;
  if (stats && rule.minPurchases != null && stats.purchases >= rule.minPurchases)
    return true;
  return false;
}

// ─── KPIs del reporte ────────────────────────────────────────────────────────

export interface CustomersReportKpis {
  /** Clientes con al menos una compra final en el período (o total si sin filtro). */
  activeCustomers: number;
  totalCustomers: number;
  totalSpent: number;
  totalPurchases: number;
  avgTicket: number;
  vipCustomers: number;
}

export function computeCustomersReportKpis(
  rows: CustomerMetricsRow[],
): CustomersReportKpis {
  let totalSpent = 0;
  let totalPurchases = 0;
  let active = 0;
  let vip = 0;
  for (const r of rows) {
    totalSpent += r.stats.totalSpent;
    totalPurchases += r.stats.purchases;
    if (r.stats.purchases > 0) active += 1;
    if (isVipCustomer(r.customer, r.stats)) vip += 1;
  }
  return {
    activeCustomers: active,
    totalCustomers: rows.length,
    totalSpent,
    totalPurchases,
    avgTicket: totalPurchases > 0 ? totalSpent / totalPurchases : 0,
    vipCustomers: vip,
  };
}

/**
 * Métricas de UN cliente en el histórico migrado de Alegra, tal como las
 * agrega la base (`metricas_clientes_alegra`).
 */
export interface MetricasClienteAlegra {
  clienteId: string;
  total: number;
  compras: number;
  /** Fecha de la última factura, `YYYY-MM-DD`. */
  ultimaFecha: string;
}

/**
 * Suma el histórico migrado a las métricas del sistema, cliente por cliente.
 *
 * 🔴 Por qué esta función existe en vez de calcularlo todo en SQL: la mitad del
 * sistema la calcula `computeCustomerPurchaseStats`, que sabe cosas que el SQL
 * no —conversiones de proforma a factura, para no contar la venta dos veces, y
 * proformas pendientes—. Duplicar esa lógica en SQL sería una segunda
 * definición de «lo comprado». Aquí se suman dos cifras ya calculadas, cada una
 * por quien sabe calcularla.
 *
 * `avgTicket` se RECALCULA sobre el total combinado: arrastrar el del sistema
 * daría un promedio que no corresponde a ninguna de las dos mitades.
 */
export function fusionarMetricasAlegra(
  filas: CustomerMetricsRow[],
  alegra: MetricasClienteAlegra[],
): CustomerMetricsRow[] {
  if (alegra.length === 0) return filas;
  const porCliente = new Map(alegra.map((m) => [m.clienteId, m]));
  return filas.map((fila) => {
    const m = porCliente.get(fila.customer.id);
    if (!m) return fila;
    const totalSpent = fila.stats.totalSpent + m.total;
    const purchases = fila.stats.purchases + m.compras;
    // La última visita es la MÁS RECIENTE de las dos fuentes. Se comparan como
    // texto ISO a propósito: `YYYY-MM-DD` y `YYYY-MM-DDTHH:mm` ordenan igual, y
    // así una factura migrada del día no pisa una venta del sistema de esa
    // misma fecha por tener menos precisión.
    const lastVisitAt =
      !fila.stats.lastVisitAt || m.ultimaFecha > fila.stats.lastVisitAt
        ? m.ultimaFecha
        : fila.stats.lastVisitAt;
    return {
      ...fila,
      stats: {
        ...fila.stats,
        totalSpent,
        purchases,
        avgTicket: purchases > 0 ? totalSpent / purchases : 0,
        lastVisitAt,
      },
    };
  });
}

/**
 * Lo que el LISTADO de clientes necesita de cada cliente, y nada más.
 *
 * 🔴 Por qué existe este tipo en vez de mandar el `Customer` entero: la
 * pantalla de clientes se traía los 6 525 clientes con TODAS sus columnas —
 * 4,9 MB de JSON, medidos— para poder buscar sin ir al servidor. Con eso, abrir
 * «Clientes» era esperar. De esos campos, la pantalla y sus ayudantes usan
 * TRECE: ocho para pintar (`coincideCliente` usa los otros cinco para buscar).
 * Los trece los fijó el compilador, no una búsqueda a ojo: recortar de menos
 * habría roto la pantalla, y recortar de más no habría avisado nadie.
 *
 * Recortar a esos doce baja el envío a 1,9 MB (61% menos), medido contra la
 * base real el 07/09/2026.
 *
 * `Customer` sigue siendo asignable a esto, así que el camino con datos de
 * ejemplo no cambia ni una línea.
 */
export type ClienteDeListado = Pick<
  Customer,
  | "id"
  | "firstName"
  | "lastName"
  | "createdAt"
  | "skinType"
  | "source"
  | "tags"
  | "customerNumber"
  | "documentNumber"
  | "documentType"
  | "email"
  | "phone"
  | "whatsapp"
>;
