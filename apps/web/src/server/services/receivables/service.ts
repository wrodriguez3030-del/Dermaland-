import "server-only";
import type { RepoContext } from "@/server/repositories/types";
import { SupabaseRepositoryError, UserFacingRepositoryError, getClient } from "@/server/repositories/supabase/client";
import { agingBucket, computeAging, overdueDays, todayRD, type AgingBucket, type AgingTotals } from "@/features/receivables/aging";

/**
 * Cuentas por Cobrar — servicio central (fuente única para pantallas, reportes
 * e IA). La cuenta por cobrar ES la proforma con balance > 0: aquí no se
 * duplica información, solo se agrega/deriva. SIEMPRE filtrado por
 * ctx.businessId además de RLS (R-SEC-01).
 */

/** Estados de venta que NO son cobrables. */
const NOT_COLLECTIBLE = ["cancelled", "draft", "expired"];

export interface ReceivableRow {
  id: string;
  number: string;
  ecfNumber: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  branchId: string;
  branchName: string;
  sellerName: string | null;
  cashierName: string;
  issuedAt: string; // created_at
  dueDate: string | null;
  creditDays: number | null;
  overdueDays: number;
  bucket: AgingBucket;
  total: number;
  paid: number;
  balance: number;
  status: string;
}

async function branchNames(sb: Awaited<ReturnType<typeof getClient>>, businessId: string): Promise<Map<string, string>> {
  const { data } = await sb.from("branches").select("id, name").eq("business_id", businessId);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
}

/** Facturas con saldo pendiente (la lista maestra del módulo). */
export async function listPending(ctx: RepoContext): Promise<ReceivableRow[]> {
  const sb = await getClient("receivables.listPending");
  const today = todayRD();
  const [{ data, error }, branches] = await Promise.all([
    sb
      .from("proformas")
      .select(
        "id, number, ecf_number, customer_id, customer_name, customer_phone, branch_id, seller_name, cashier_name, created_at, due_date, total, paid, balance, status",
      )
      .eq("business_id", ctx.businessId)
      .gt("balance", 0)
      .not("status", "in", `(${NOT_COLLECTIBLE.join(",")})`)
      .order("due_date", { ascending: true, nullsFirst: false }),
    branchNames(sb, ctx.businessId),
  ]);
  if (error) throw new SupabaseRepositoryError("receivables.listPending", error);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => {
    const issued = String(r.created_at).slice(0, 10);
    const due: string | null = r.due_date ?? null;
    const creditDays = due
      ? Math.max(0, Math.round((Date.parse(due) - Date.parse(issued)) / 86400000))
      : null;
    return {
      id: r.id,
      number: r.number,
      ecfNumber: r.ecf_number ?? null,
      customerId: r.customer_id ?? null,
      customerName: r.customer_name,
      customerPhone: r.customer_phone ?? null,
      branchId: r.branch_id,
      branchName: branches.get(r.branch_id) ?? "—",
      sellerName: r.seller_name ?? null,
      cashierName: r.cashier_name,
      issuedAt: issued,
      dueDate: due,
      creditDays,
      overdueDays: Math.max(0, overdueDays(due, today)),
      bucket: agingBucket(due, today),
      total: Number(r.total),
      paid: Number(r.paid),
      balance: Number(r.balance),
      status: r.status,
    };
  });
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export interface ArSummary {
  totalPendiente: number;
  facturasPendientes: number;
  facturasVencidas: number;
  montoVencido: number;
  clientesMorosos: number;
  cobradoHoy: number;
  cobradoMes: number;
  proximos7Dias: { count: number; amount: number };
  promedioDiasCobro: number | null;
  recuperacionPct: number | null;
  aging: AgingTotals;
  porSucursal: { label: string; value: number }[];
  porVendedor: { label: string; value: number }[];
  cobradoPorMes: { label: string; value: number }[];
  promesasHoy: number;
}

/** Pagos de COBRANZA (registrados por el módulo): balance_after no nulo. */
async function collectionsSince(
  sb: Awaited<ReturnType<typeof getClient>>,
  businessId: string,
  sinceIso: string,
): Promise<{ amount: number; createdAt: string; proformaId: string }[]> {
  const { data, error } = await sb
    .from("proforma_payments")
    .select("amount, created_at, proforma_id")
    .eq("business_id", businessId)
    .not("balance_after", "is", null)
    .gte("created_at", sinceIso);
  if (error) throw new SupabaseRepositoryError("receivables.collections", error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    amount: Number(r.amount),
    createdAt: r.created_at as string,
    proformaId: r.proforma_id as string,
  }));
}

export async function summary(ctx: RepoContext): Promise<ArSummary> {
  const sb = await getClient("receivables.summary");
  const today = todayRD();
  const pending = await listPending(ctx);
  const aging = computeAging(pending, today);

  const monthStart = `${today.slice(0, 7)}-01T00:00:00Z`;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const collections = await collectionsSince(sb, ctx.businessId, sixMonthsAgo.toISOString().slice(0, 10));

  const todayCollections = collections.filter((c) => c.createdAt.slice(0, 10) === today);
  const monthCollections = collections.filter((c) => c.createdAt >= monthStart);
  const cobradoHoy = round2(todayCollections.reduce((s, c) => s + c.amount, 0));
  const cobradoMes = round2(monthCollections.reduce((s, c) => s + c.amount, 0));

  // Promedio de días entre emisión y cobro (cobranzas de los últimos 6 meses).
  let promedioDiasCobro: number | null = null;
  if (collections.length > 0) {
    const ids = [...new Set(collections.map((c) => c.proformaId))];
    const { data: profs } = await sb
      .from("proformas")
      .select("id, created_at")
      .eq("business_id", ctx.businessId)
      .in("id", ids.slice(0, 400));
    const issuedBy = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((profs ?? []) as any[]).map((p) => [p.id as string, String(p.created_at)]),
    );
    const days = collections
      .map((c) => {
        const issued = issuedBy.get(c.proformaId);
        return issued ? (Date.parse(c.createdAt) - Date.parse(issued)) / 86400000 : null;
      })
      .filter((d): d is number => d != null && d >= 0);
    if (days.length > 0) promedioDiasCobro = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
  }

  // Índice de recuperación del mes: cobrado / (cobrado + pendiente actual).
  const recuperacionPct =
    cobradoMes + aging.totalAmount > 0
      ? Math.round((cobradoMes / (cobradoMes + aging.totalAmount)) * 1000) / 10
      : null;

  const proximos = pending.filter(
    (p) => p.bucket === "por_vencer" && p.dueDate != null,
  );

  const byKey = (rows: ReceivableRow[], key: (r: ReceivableRow) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), round2((m.get(key(r)) ?? 0) + r.balance));
    return [...m.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  };

  const monthLabels: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const ym = d.toISOString().slice(0, 7);
    monthLabels.push({
      label: ym,
      value: round2(collections.filter((c) => c.createdAt.slice(0, 7) === ym).reduce((s, c) => s + c.amount, 0)),
    });
  }

  const { count: promesasHoy } = await sb
    .from("ar_promises")
    .select("*", { count: "exact", head: true })
    .eq("business_id", ctx.businessId)
    .eq("status", "pending")
    .lte("promised_date", today);

  return {
    totalPendiente: aging.totalAmount,
    facturasPendientes: aging.totalCount,
    facturasVencidas: aging.overdueCount,
    montoVencido: aging.overdueAmount,
    clientesMorosos: new Set(
      pending.filter((p) => p.overdueDays > 0).map((p) => p.customerId ?? p.customerName),
    ).size,
    cobradoHoy,
    cobradoMes,
    proximos7Dias: {
      count: proximos.length,
      amount: round2(proximos.reduce((s, p) => s + p.balance, 0)),
    },
    promedioDiasCobro,
    recuperacionPct,
    aging,
    porSucursal: byKey(pending, (r) => r.branchName),
    porVendedor: byKey(pending, (r) => r.sellerName ?? r.cashierName),
    cobradoPorMes: monthLabels,
    promesasHoy: promesasHoy ?? 0,
  };
}

// ── Cobros ──────────────────────────────────────────────────────────────────

export interface CollectInput {
  items: { proformaId: string; amount: number }[];
  method: string;
  reference?: string;
  bank?: string;
  comments?: string;
}

export interface CollectResult {
  applied: { proforma_id: string; number: string; amount: number; new_balance: number; new_status: string }[];
  totalApplied: number;
}

const AR_METHODS = new Set(["cash", "card", "transfer", "manual", "other"]);

/** Cobro atómico multi-factura vía RPC ar_apply_payments (mig 0031). */
export async function collect(ctx: RepoContext, input: CollectInput): Promise<CollectResult> {
  if (!input.items?.length) throw new UserFacingRepositoryError("No hay pagos que aplicar.");
  if (!AR_METHODS.has(input.method)) throw new UserFacingRepositoryError("Método de pago inválido.");
  const sb = await getClient("receivables.collect");
  // Banco y comentarios viajan en la referencia (proforma_payments.reference),
  // como hace el POS con last4 — sin columnas nuevas.
  const refParts = [input.reference?.trim(), input.bank ? `Banco: ${input.bank.trim()}` : null, input.comments?.trim()]
    .filter(Boolean);
  const { data, error } = await sb.rpc("ar_apply_payments", {
    p_items: input.items.map((i) => ({ proforma_id: i.proformaId, amount: i.amount })),
    p_method: input.method,
    p_reference: refParts.length ? refParts.join(" · ").slice(0, 300) : null,
    p_user_id: ctx.userId ?? null,
    p_user_name: ctx.userName ?? null,
  });
  if (error) {
    const msg = String(error.message ?? "");
    // Los RAISE EXCEPTION del RPC ya vienen en lenguaje de usuario.
    if (/factura|saldo|pago|venta|cobr/i.test(msg)) throw new UserFacingRepositoryError(msg);
    throw new SupabaseRepositoryError("receivables.collect", error);
  }
  const applied = (data ?? []) as CollectResult["applied"];
  return { applied, totalApplied: round2(applied.reduce((s, a) => s + Number(a.amount), 0)) };
}

// ── Historial de cobros ─────────────────────────────────────────────────────

export interface CollectionHistoryRow {
  id: string;
  createdAt: string;
  proformaId: string;
  number: string;
  customerName: string;
  method: string;
  reference: string | null;
  userName: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
}

export async function collectionHistory(ctx: RepoContext, limit = 300): Promise<CollectionHistoryRow[]> {
  const sb = await getClient("receivables.history");
  const { data, error } = await sb
    .from("proforma_payments")
    .select("id, created_at, proforma_id, method_code, reference, user_name, amount, balance_after")
    .eq("business_id", ctx.businessId)
    .not("balance_after", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new SupabaseRepositoryError("receivables.history", error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.map((r) => r.proforma_id as string))];
  const { data: profs } = ids.length
    ? await sb.from("proformas").select("id, number, customer_name").eq("business_id", ctx.businessId).in("id", ids)
    : { data: [] };
  const meta = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((profs ?? []) as any[]).map((p) => [p.id as string, { number: p.number as string, customer: p.customer_name as string }]),
  );
  return rows.map((r) => {
    const amount = Number(r.amount);
    const after = Number(r.balance_after);
    return {
      id: r.id,
      createdAt: r.created_at,
      proformaId: r.proforma_id,
      number: meta.get(r.proforma_id)?.number ?? "—",
      customerName: meta.get(r.proforma_id)?.customer ?? "—",
      method: r.method_code,
      reference: r.reference ?? null,
      userName: r.user_name,
      amount,
      balanceBefore: round2(after + amount),
      balanceAfter: after,
    };
  });
}

// ── Estado de cuenta por cliente ────────────────────────────────────────────

export interface ClientStatement {
  client: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    creditLimit: number | null;
    creditDays: number | null;
    creditBlocked: boolean;
  };
  invoices: ReceivableRow[];
  paidInvoicesCount: number;
  payments: CollectionHistoryRow[];
  saldoTotal: number;
  aging: AgingTotals;
  ultimoPago: string | null;
}

export async function clientStatement(ctx: RepoContext, clientId: string): Promise<ClientStatement> {
  const sb = await getClient("receivables.statement");
  const { data: client, error: cErr } = await sb
    .from("clients")
    .select("id, first_name, last_name, phone, email, credit_limit, credit_days, credit_blocked")
    .eq("business_id", ctx.businessId)
    .eq("id", clientId)
    .maybeSingle();
  if (cErr) throw new SupabaseRepositoryError("receivables.statement", cErr);
  if (!client) throw new UserFacingRepositoryError("Cliente no encontrado.");

  const pending = (await listPending(ctx)).filter((r) => r.customerId === clientId);
  const history = await collectionHistory(ctx, 500);
  // Pagos del cliente: filtra por sus facturas (todas, no solo pendientes).
  const { data: allIds } = await sb
    .from("proformas")
    .select("id")
    .eq("business_id", ctx.businessId)
    .eq("customer_id", clientId);
  const idSet = new Set(((allIds ?? []) as { id: string }[]).map((p) => p.id));
  const payments = history.filter((h) => idSet.has(h.proformaId));

  const { count: paidCount } = await sb
    .from("proformas")
    .select("*", { count: "exact", head: true })
    .eq("business_id", ctx.businessId)
    .eq("customer_id", clientId)
    .eq("balance", 0)
    .not("status", "in", `(${NOT_COLLECTIBLE.join(",")})`);

  const today = todayRD();
  return {
    client: {
      id: client.id,
      name: `${client.first_name} ${client.last_name}`.trim(),
      phone: client.phone ?? null,
      email: client.email ?? null,
      creditLimit: client.credit_limit == null ? null : Number(client.credit_limit),
      creditDays: client.credit_days == null ? null : Number(client.credit_days),
      creditBlocked: Boolean(client.credit_blocked),
    },
    invoices: pending,
    paidInvoicesCount: paidCount ?? 0,
    payments,
    saldoTotal: round2(pending.reduce((s, p) => s + p.balance, 0)),
    aging: computeAging(pending, today),
    ultimoPago: payments[0]?.createdAt ?? null,
  };
}

// ── Promesas de pago ────────────────────────────────────────────────────────

export interface PromiseRow {
  id: string;
  clientId: string | null;
  clientName: string;
  proformaId: string | null;
  promisedDate: string;
  amount: number;
  notes: string | null;
  status: "pending" | "kept" | "broken";
  createdByName: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function promiseRowToTs(r: any): PromiseRow {
  return {
    id: r.id,
    clientId: r.client_id ?? null,
    clientName: r.client_name,
    proformaId: r.proforma_id ?? null,
    promisedDate: r.promised_date,
    amount: Number(r.amount),
    notes: r.notes ?? null,
    status: r.status,
    createdByName: r.created_by_name ?? null,
    createdAt: r.created_at,
  };
}

export async function listPromises(ctx: RepoContext): Promise<PromiseRow[]> {
  const sb = await getClient("receivables.promises");
  const { data, error } = await sb
    .from("ar_promises")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("promised_date", { ascending: true });
  if (error) throw new SupabaseRepositoryError("receivables.promises", error);
  return (data ?? []).map(promiseRowToTs);
}

export async function createPromise(
  ctx: RepoContext,
  input: { clientId?: string | null; clientName: string; proformaId?: string | null; promisedDate: string; amount: number; notes?: string },
): Promise<PromiseRow> {
  if (!input.clientName?.trim()) throw new UserFacingRepositoryError("Falta el cliente.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.promisedDate)) throw new UserFacingRepositoryError("Fecha comprometida inválida.");
  if (!(input.amount > 0)) throw new UserFacingRepositoryError("El monto prometido debe ser mayor que cero.");
  const sb = await getClient("receivables.createPromise");
  const { data, error } = await sb
    .from("ar_promises")
    .insert({
      business_id: ctx.businessId,
      client_id: input.clientId ?? null,
      client_name: input.clientName.trim(),
      proforma_id: input.proformaId ?? null,
      promised_date: input.promisedDate,
      amount: input.amount,
      notes: input.notes?.trim() || null,
      created_by: ctx.userId ?? null,
      created_by_name: ctx.userName ?? null,
    })
    .select("*")
    .single();
  if (error) throw new SupabaseRepositoryError("receivables.createPromise", error);
  return promiseRowToTs(data);
}

export async function updatePromiseStatus(
  ctx: RepoContext,
  id: string,
  status: "pending" | "kept" | "broken",
): Promise<PromiseRow> {
  const sb = await getClient("receivables.updatePromise");
  const { data, error } = await sb
    .from("ar_promises")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.businessId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new SupabaseRepositoryError("receivables.updatePromise", error);
  return promiseRowToTs(data);
}

// ── Configuración del módulo ────────────────────────────────────────────────

export interface ArSettings {
  defaultCreditDays: number;
  blockOverLimit: boolean;
  reminderOffsetsDays: number[];
}

export async function getSettings(ctx: RepoContext): Promise<ArSettings> {
  const sb = await getClient("receivables.settings");
  const { data } = await sb
    .from("ar_settings")
    .select("default_credit_days, block_over_limit, reminder_offsets_days")
    .eq("business_id", ctx.businessId)
    .maybeSingle();
  return {
    defaultCreditDays: Number(data?.default_credit_days ?? 30),
    blockOverLimit: Boolean(data?.block_over_limit),
    reminderOffsetsDays: (data?.reminder_offsets_days as number[] | null) ?? [-7, -3, -1, 0, 1, 7, 15, 30],
  };
}

export async function saveSettings(ctx: RepoContext, s: ArSettings): Promise<ArSettings> {
  if (!(s.defaultCreditDays >= 0 && s.defaultCreditDays <= 365)) {
    throw new UserFacingRepositoryError("Los días de crédito deben estar entre 0 y 365.");
  }
  const sb = await getClient("receivables.saveSettings");
  const { error } = await sb.from("ar_settings").upsert({
    business_id: ctx.businessId,
    default_credit_days: Math.round(s.defaultCreditDays),
    block_over_limit: !!s.blockOverLimit,
    reminder_offsets_days: s.reminderOffsetsDays?.length ? s.reminderOffsetsDays : [-7, -3, -1, 0, 1, 7, 15, 30],
    updated_at: new Date().toISOString(),
  });
  if (error) throw new SupabaseRepositoryError("receivables.saveSettings", error);
  return getSettings(ctx);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
