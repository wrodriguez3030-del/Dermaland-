/**
 * Agregados del historial de ventas de Alegra. PURO: recibe las filas ya
 * cargadas y no toca red ni reloj.
 *
 * Estas ventas son las de Alegra (el sistema de verdad), NO las proformas ni el
 * POS de DermaLand: viven en sus propias tablas y no se mezclan (decisión 2 de
 * la spec). Las facturas anuladas quedan FUERA de todos los totales, pero se
 * cuentan aparte para que nadie piense que se perdieron.
 */

export interface AlegraInvoiceRow {
  id: string;
  ncf: string | null;
  date: string;
  status: "open" | "closed" | "void" | "draft";
  clientId: string | null;
  clientName: string | null;
  branchId: string | null;
  sellerName: string | null;
  paymentMethod: string | null;
  subtotal: number;
  itbis: number;
  total: number;
  totalPaid: number;
  balance: number;
}

export interface AlegraInvoiceLineRow {
  invoiceId: string;
  productId: string | null;
  name: string;
  quantity: number;
  total: number;
}

export interface SalesTotals {
  facturas: number;
  anuladas: number;
  subtotal: number;
  itbis: number;
  total: number;
  cobrado: number;
  saldo: number;
}

export interface Grupo {
  clave: string;
  etiqueta: string;
  facturas: number;
  total: number;
}

export interface ProductoVendido {
  productId: string | null;
  name: string;
  unidades: number;
  total: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Una factura cuenta para los totales si no está anulada ni en borrador. */
export function cuentaParaTotales(inv: Pick<AlegraInvoiceRow, "status">): boolean {
  return inv.status !== "void" && inv.status !== "draft";
}

export function totalesDeVentas(invoices: AlegraInvoiceRow[]): SalesTotals {
  const validas = invoices.filter(cuentaParaTotales);
  return {
    facturas: validas.length,
    anuladas: invoices.filter((i) => i.status === "void").length,
    subtotal: round2(validas.reduce((a, i) => a + i.subtotal, 0)),
    itbis: round2(validas.reduce((a, i) => a + i.itbis, 0)),
    total: round2(validas.reduce((a, i) => a + i.total, 0)),
    cobrado: round2(validas.reduce((a, i) => a + i.totalPaid, 0)),
    saldo: round2(validas.reduce((a, i) => a + i.balance, 0)),
  };
}

function agrupar(
  invoices: AlegraInvoiceRow[],
  clave: (i: AlegraInvoiceRow) => string,
  etiqueta: (i: AlegraInvoiceRow) => string,
): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const i of invoices.filter(cuentaParaTotales)) {
    const k = clave(i);
    const g = mapa.get(k) ?? { clave: k, etiqueta: etiqueta(i), facturas: 0, total: 0 };
    g.facturas++;
    g.total = round2(g.total + i.total);
    mapa.set(k, g);
  }
  return [...mapa.values()];
}

/** Por día, de más reciente a más antiguo. */
export function ventasPorDia(invoices: AlegraInvoiceRow[]): Grupo[] {
  return agrupar(invoices, (i) => i.date, (i) => i.date).sort((a, b) => b.clave.localeCompare(a.clave));
}

/** Por vendedor, de mayor a menor. Sin vendedor → «Sin vendedor». */
export function ventasPorVendedor(invoices: AlegraInvoiceRow[]): Grupo[] {
  return agrupar(
    invoices,
    (i) => i.sellerName ?? "",
    (i) => i.sellerName ?? "Sin vendedor",
  ).sort((a, b) => b.total - a.total);
}

/** Por forma de pago, de mayor a menor. */
export function ventasPorMetodo(invoices: AlegraInvoiceRow[]): Grupo[] {
  return agrupar(
    invoices,
    (i) => i.paymentMethod ?? "",
    (i) => METODO_ETIQUETA[i.paymentMethod ?? ""] ?? i.paymentMethod ?? "Sin método",
  ).sort((a, b) => b.total - a.total);
}

export const METODO_ETIQUETA: Record<string, string> = {
  cash: "Efectivo",
  "credit-card": "Tarjeta de crédito",
  "debit-card": "Tarjeta de débito",
  transfer: "Transferencia",
  check: "Cheque",
  // Alegra la usa para las ventas a crédito: 4 facturas migradas
  // (RD$29 982,98), medidas contra la base real el 06/09/2026. Faltaba, y el
  // desglose de medios de pago enseñaba la fila literal `credit-sell`.
  "credit-sell": "Venta a crédito",
  "": "Sin método",
};

/**
 * Productos más vendidos. Solo cuenta líneas de facturas que suman a los
 * totales: una línea de una factura anulada no es una venta.
 */
export function productosVendidos(
  invoices: AlegraInvoiceRow[],
  lines: AlegraInvoiceLineRow[],
  limite = 20,
): ProductoVendido[] {
  const validas = new Set(invoices.filter(cuentaParaTotales).map((i) => i.id));
  const mapa = new Map<string, ProductoVendido>();
  for (const l of lines) {
    if (!validas.has(l.invoiceId)) continue;
    const k = l.productId ?? `nombre:${l.name}`;
    const p = mapa.get(k) ?? { productId: l.productId, name: l.name, unidades: 0, total: 0 };
    p.unidades = round2(p.unidades + l.quantity);
    p.total = round2(p.total + l.total);
    mapa.set(k, p);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, limite);
}

export interface SaldoCliente {
  clientId: string | null;
  clientName: string;
  facturas: number;
  saldo: number;
  masAntigua: string;
}

/**
 * Saldos pendientes agrupados por cliente, de mayor a menor. Solo facturas que
 * cuentan y con saldo > 0.
 */
export function saldosPorCliente(invoices: AlegraInvoiceRow[]): SaldoCliente[] {
  const mapa = new Map<string, SaldoCliente>();
  for (const i of invoices) {
    if (!cuentaParaTotales(i) || i.balance <= 0) continue;
    const k = i.clientId ?? `nombre:${i.clientName ?? ""}`;
    const s = mapa.get(k) ?? {
      clientId: i.clientId,
      clientName: i.clientName ?? "Sin cliente",
      facturas: 0,
      saldo: 0,
      masAntigua: i.date,
    };
    s.facturas++;
    s.saldo = round2(s.saldo + i.balance);
    if (i.date < s.masAntigua) s.masAntigua = i.date;
    mapa.set(k, s);
  }
  return [...mapa.values()].sort((a, b) => b.saldo - a.saldo);
}

/** Días transcurridos entre dos fechas ISO (`YYYY-MM-DD`), nunca negativo. */
export function diasDesde(fecha: string, hoy: string): number {
  const a = Date.parse(`${fecha}T00:00:00Z`);
  const b = Date.parse(`${hoy}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}
