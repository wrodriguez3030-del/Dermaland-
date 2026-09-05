/**
 * Lecturas del historial de Alegra guardado en DermaLand.
 *
 * Todo pasa por el cliente con sesión (RLS por `business_id`) y filtra además
 * por `ctx.businessId`, igual que los repositorios. Solo LEE: quien escribe
 * estas tablas es el sincronizador (`scripts/alegra-sync.mts`).
 *
 * Se pagina SIEMPRE: PostgREST corta en 1000 filas en silencio y un rango de
 * un año pasa de 5000 facturas.
 */
import "server-only";
import type { RepoContext } from "@/server/repositories";
import { getClient, failRepo } from "@/server/repositories/supabase/client";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";
import type { AlegraInvoiceLineRow, AlegraInvoiceRow } from "@/features/alegra/sales-report";

const CAMPOS_FACTURA =
  "id,ncf,date,status,client_id,client_name,branch_id,seller_name,payment_method,subtotal,itbis,total,total_paid,balance";

type FilaFactura = {
  id: string;
  ncf: string | null;
  date: string;
  status: AlegraInvoiceRow["status"];
  client_id: string | null;
  client_name: string | null;
  branch_id: string | null;
  seller_name: string | null;
  payment_method: string | null;
  subtotal: number | string;
  itbis: number | string;
  total: number | string;
  total_paid: number | string;
  balance: number | string;
};

const num = (v: number | string | null): number => Number(v ?? 0) || 0;

function aFactura(r: FilaFactura): AlegraInvoiceRow {
  return {
    id: r.id,
    ncf: r.ncf,
    date: r.date,
    status: r.status,
    clientId: r.client_id,
    clientName: r.client_name,
    branchId: r.branch_id,
    sellerName: r.seller_name,
    paymentMethod: r.payment_method,
    subtotal: num(r.subtotal),
    itbis: num(r.itbis),
    total: num(r.total),
    totalPaid: num(r.total_paid),
    balance: num(r.balance),
  };
}

/** Facturas de Alegra de un cliente, de la más reciente a la más antigua. */
export async function facturasDeCliente(
  ctx: RepoContext,
  clientId: string,
  limite = 200,
): Promise<AlegraInvoiceRow[]> {
  const sb = await getClient("alegra.facturasDeCliente");
  const { data, error } = await sb
    .from("alegra_invoices")
    .select(CAMPOS_FACTURA)
    .eq("business_id", ctx.businessId)
    .eq("client_id", clientId)
    .order("date", { ascending: false })
    .limit(limite);
  if (error) failRepo("alegra.facturasDeCliente", error);
  return ((data ?? []) as FilaFactura[]).map(aFactura);
}

/** Facturas de un rango de fechas (`YYYY-MM-DD`, ambas inclusive). */
export async function facturasEnRango(
  ctx: RepoContext,
  desde: string,
  hasta: string,
  branchId?: string,
): Promise<AlegraInvoiceRow[]> {
  const sb = await getClient("alegra.facturasEnRango");
  const filas = await fetchAllPages<FilaFactura>(async (from, to) => {
    let q = sb
      .from("alegra_invoices")
      .select(CAMPOS_FACTURA)
      .eq("business_id", ctx.businessId)
      .gte("date", desde)
      .lte("date", hasta);
    if (branchId) q = q.eq("branch_id", branchId);
    const { data, error } = await q.order("date", { ascending: false }).order("id").range(from, to);
    if (error) failRepo("alegra.facturasEnRango", error);
    return (data ?? []) as FilaFactura[];
  });
  return filas.map(aFactura);
}

/** Líneas de un conjunto de facturas (para el ranking de productos). */
export async function lineasDeFacturas(
  ctx: RepoContext,
  invoiceIds: string[],
): Promise<AlegraInvoiceLineRow[]> {
  if (invoiceIds.length === 0) return [];
  const sb = await getClient("alegra.lineasDeFacturas");
  const out: AlegraInvoiceLineRow[] = [];
  // `in` con miles de ids revienta la URL: se pide por tandas.
  const TANDA = 200;
  for (let i = 0; i < invoiceIds.length; i += TANDA) {
    const tanda = invoiceIds.slice(i, i + TANDA);
    const filas = await fetchAllPages<{
      invoice_id: string;
      product_id: string | null;
      name: string;
      quantity: number | string;
      total: number | string;
    }>(async (from, to) => {
      const { data, error } = await sb
        .from("alegra_invoice_items")
        .select("invoice_id,product_id,name,quantity,total")
        .eq("business_id", ctx.businessId)
        .in("invoice_id", tanda)
        .order("id")
        .range(from, to);
      if (error) failRepo("alegra.lineasDeFacturas", error);
      return data ?? [];
    });
    for (const f of filas) {
      out.push({
        invoiceId: f.invoice_id,
        productId: f.product_id,
        name: f.name,
        quantity: num(f.quantity),
        total: num(f.total),
      });
    }
  }
  return out;
}

/** Facturas con saldo pendiente, de la más antigua a la más nueva. */
export async function facturasConSaldo(ctx: RepoContext): Promise<AlegraInvoiceRow[]> {
  const sb = await getClient("alegra.facturasConSaldo");
  const filas = await fetchAllPages<FilaFactura>(async (from, to) => {
    const { data, error } = await sb
      .from("alegra_invoices")
      .select(CAMPOS_FACTURA)
      .eq("business_id", ctx.businessId)
      .gt("balance", 0)
      .neq("status", "void")
      .order("date", { ascending: true })
      .order("id")
      .range(from, to);
    if (error) failRepo("alegra.facturasConSaldo", error);
    return (data ?? []) as FilaFactura[];
  });
  return filas.map(aFactura);
}

export interface CorridaSync {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  trigger: string;
  mode: string;
  dryRun: boolean;
  counts: Record<string, Record<string, number>>;
  errors: Array<{ entity: string; message: string }>;
  logUrl: string | null;
}

/** Últimas corridas del sincronizador, de la más reciente a la más antigua. */
export async function ultimasCorridas(ctx: RepoContext, limite = 10): Promise<CorridaSync[]> {
  const sb = await getClient("alegra.ultimasCorridas");
  const { data, error } = await sb
    .from("alegra_sync_runs")
    .select("id,started_at,finished_at,ok,trigger,mode,dry_run,counts,errors,log_url")
    .eq("business_id", ctx.businessId)
    .order("started_at", { ascending: false })
    .limit(limite);
  if (error) failRepo("alegra.ultimasCorridas", error);
  return (data ?? []).map(
    (r: Record<string, unknown>): CorridaSync => ({
      id: String(r.id),
      startedAt: String(r.started_at),
      finishedAt: (r.finished_at as string) ?? null,
      ok: (r.ok as boolean | null) ?? null,
      trigger: String(r.trigger),
      mode: String(r.mode),
      dryRun: Boolean(r.dry_run),
      counts: (r.counts as CorridaSync["counts"]) ?? {},
      errors: (r.errors as CorridaSync["errors"]) ?? [],
      logUrl: (r.log_url as string) ?? null,
    }),
  );
}

/** Cuántas filas trajo la sincronización, para la pantalla de integración. */
export async function resumenAlegra(ctx: RepoContext): Promise<{
  clientes: number;
  productos: number;
  facturas: number;
  lineas: number;
}> {
  const sb = await getClient("alegra.resumen");
  const cuenta = (r: { count: number | null; error: unknown }, donde: string): number => {
    if (r.error) failRepo(`alegra.resumen(${donde})`, r.error);
    return r.count ?? 0;
  };
  const conteo = { count: "exact", head: true } as const;
  const [clientes, productos, facturas, lineas] = await Promise.all([
    sb.from("clients").select("id", conteo).eq("business_id", ctx.businessId).not("alegra_id", "is", null),
    sb.from("products").select("id", conteo).eq("business_id", ctx.businessId).not("alegra_id", "is", null),
    sb.from("alegra_invoices").select("id", conteo).eq("business_id", ctx.businessId),
    sb.from("alegra_invoice_items").select("id", conteo).eq("business_id", ctx.businessId),
  ]);
  return {
    clientes: cuenta(clientes, "clients"),
    productos: cuenta(productos, "products"),
    facturas: cuenta(facturas, "alegra_invoices"),
    lineas: cuenta(lineas, "alegra_invoice_items"),
  };
}
