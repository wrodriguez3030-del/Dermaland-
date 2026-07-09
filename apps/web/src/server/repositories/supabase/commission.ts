import "server-only";

/**
 * Repositorio Supabase de Comisión de Ventas (Fase 2).
 *
 * Persiste reglas, exclusiones, estado de pago, lotes y auditoría en las tablas
 * `sales_commission_rules`, `commission_exclusions`, `commission_payouts`,
 * `commission_payment_batches` y `commission_audit` (migración 0023).
 *
 * Reglas de oro (idénticas al resto de repos Supabase):
 *  1. SIEMPRE filtrar por `business_id = ctx.businessId` — el `businessId` viene
 *     del JWT (nunca del cliente). RLS lo refuerza; el filtro es defensa en
 *     profundidad (R-SEC-01).
 *  2. Mapeo snake_case (row) ↔ camelCase (TS) en los helpers `*RowToTs`.
 *
 * No forma parte del agregado `Repositories`: es un feature autocontenido cuyas
 * rutas API (`app/api/commission/*`) lo consumen directamente, igual que
 * `dgii`/`purchases` exponen helpers propios.
 */

import { createHash } from "node:crypto";
import type { RepoContext } from "../types";
import { type AnySupabase, SupabaseRepositoryError, failRepo, getClient } from "./client";
import { DEFAULT_COMMISSION_RULES, type CommissionRule } from "@/features/reports/commission/commission-rules";
import type { PaymentGroup } from "@/features/sales/sales-report";
import type { CommissionExclusion } from "@/features/reports/commission/commission-exclusions-store";
import type { ManagedPayout, PayoutRecord } from "@/features/reports/commission/commission-payout-store";
import type { CommissionBatch } from "@/features/reports/commission/commission-batch-store";
import type {
  CommissionAuditAction,
  CommissionAuditEntry,
} from "@/features/reports/commission/commission-audit-store";

// ─── Mappers row → TS ────────────────────────────────────────────────────────

function ruleRowToTs(r: Record<string, unknown>): CommissionRule {
  const groups = (r.payment_groups as string[] | null) ?? undefined;
  return {
    id: r.id as string,
    name: r.name as string,
    percentage: Number(r.percentage),
    paymentGroups: groups && groups.length ? (groups as PaymentGroup[]) : undefined,
    sellerId: (r.seller_id as string | null) ?? undefined,
    branchId: (r.branch_id as string | null) ?? undefined,
    startsAt: (r.starts_at as string | null) ?? undefined,
    endsAt: (r.ends_at as string | null) ?? undefined,
    priority: Number(r.priority),
    active: r.active as boolean,
  };
}

function exclusionRowToTs(r: Record<string, unknown>): CommissionExclusion {
  return {
    comprobante: r.comprobante as string,
    reason: r.reason as string,
    userName: (r.user_name as string | null) ?? "Administrador",
    createdAt: r.created_at as string,
  };
}

function payoutRowToTs(r: Record<string, unknown>): PayoutRecord {
  return {
    comprobante: r.comprobante as string,
    status: r.status as ManagedPayout,
    userName: (r.user_name as string | null) ?? "Administrador",
    at: r.at as string,
    batchId: (r.batch_id as string | null) ?? undefined,
  };
}

function batchRowToTs(r: Record<string, unknown>): CommissionBatch {
  return {
    id: r.id as string,
    periodFrom: (r.period_from as string | null) ?? undefined,
    periodTo: (r.period_to as string | null) ?? undefined,
    sellerId: (r.seller_id as string | null) ?? undefined,
    sellerName: (r.seller_name as string | null) ?? undefined,
    comprobantes: (r.comprobantes as string[] | null) ?? [],
    total: Number(r.total),
    // Solo creamos lotes "paid"; el union del tipo cliente es "paid".
    status: "paid",
    createdBy: (r.created_by as string | null) ?? "Administrador",
    createdAt: r.created_at as string,
  };
}

function auditRowToTs(r: Record<string, unknown>): CommissionAuditEntry {
  return {
    id: r.id as string,
    action: r.action as CommissionAuditAction,
    comprobantes: (r.comprobantes as string[] | null) ?? [],
    amount: r.amount != null ? Number(r.amount) : undefined,
    batchId: (r.batch_id as string | null) ?? undefined,
    userName: (r.user_name as string | null) ?? "Administrador",
    reason: (r.reason as string | null) ?? undefined,
    at: r.at as string,
  };
}

// ─── Reglas ──────────────────────────────────────────────────────────────────

export interface RuleInput {
  name: string;
  percentage: number;
  paymentGroups?: PaymentGroup[];
  sellerId?: string;
  branchId?: string;
  startsAt?: string;
  endsAt?: string;
  priority: number;
  active: boolean;
}

function ruleInputToRow(ctx: RepoContext, input: RuleInput): Record<string, unknown> {
  return {
    business_id: ctx.businessId,
    name: input.name,
    percentage: input.percentage,
    payment_groups: input.paymentGroups && input.paymentGroups.length ? input.paymentGroups : null,
    seller_id: input.sellerId ?? null,
    branch_id: input.branchId ?? null,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null,
    priority: input.priority,
    active: input.active,
  };
}

/**
 * UUID DETERMINISTA por (negocio, clave de regla por defecto). Hace la siembra
 * idempotente: dos GET concurrentes que encuentran la tabla vacía calculan los
 * MISMOS ids y el `upsert on-conflict-do-nothing` (sobre el PK) evita duplicar.
 */
function defaultRuleId(businessId: string, key: string): string {
  const h = createHash("md5").update(`${businessId}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function selectRules(sb: AnySupabase, ctx: RepoContext): Promise<CommissionRule[]> {
  const { data, error } = await sb
    .from("sales_commission_rules")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("priority", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new SupabaseRepositoryError("commission.listRules", error);
  return (data ?? []).map(ruleRowToTs);
}

/**
 * Siembra las reglas por defecto (idempotente). El reporte comisiona desde el
 * minuto cero, igual que el fallback localStorage devolvía `DEFAULT_COMMISSION_
 * RULES` cuando no había nada — pero aquí persistidas para poder editarlas.
 */
async function seedDefaultRules(sb: AnySupabase, ctx: RepoContext): Promise<void> {
  const rows = DEFAULT_COMMISSION_RULES.map((r) => ({
    id: defaultRuleId(ctx.businessId, r.id),
    ...ruleInputToRow(ctx, {
      name: r.name,
      percentage: r.percentage,
      paymentGroups: r.paymentGroups,
      sellerId: r.sellerId,
      branchId: r.branchId,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      priority: r.priority,
      active: r.active,
    }),
  }));
  const { error } = await sb
    .from("sales_commission_rules")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw failRepo("commission.seedRules", error);
}

export async function listRules(ctx: RepoContext): Promise<CommissionRule[]> {
  const sb = await getClient("commission.listRules");
  let rows = await selectRules(sb, ctx);
  if (rows.length === 0) {
    await seedDefaultRules(sb, ctx);
    rows = await selectRules(sb, ctx);
  }
  return rows;
}

export async function createRule(ctx: RepoContext, input: RuleInput): Promise<CommissionRule> {
  const sb = await getClient("commission.createRule");
  const { data, error } = await sb
    .from("sales_commission_rules")
    .insert(ruleInputToRow(ctx, input))
    .select("*")
    .single();
  if (error) throw failRepo("commission.createRule", error);
  return ruleRowToTs(data);
}

export async function updateRule(
  ctx: RepoContext,
  id: string,
  input: RuleInput,
): Promise<CommissionRule> {
  const sb = await getClient("commission.updateRule");
  const row = { ...ruleInputToRow(ctx, input), updated_at: new Date().toISOString() };
  delete (row as Record<string, unknown>).business_id; // no se re-escribe el tenant
  const { data, error } = await sb
    .from("sales_commission_rules")
    .update(row)
    .eq("business_id", ctx.businessId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw failRepo("commission.updateRule", error);
  return ruleRowToTs(data);
}

export async function toggleRule(ctx: RepoContext, id: string): Promise<CommissionRule> {
  const sb = await getClient("commission.toggleRule");
  const { data: current, error: readErr } = await sb
    .from("sales_commission_rules")
    .select("active")
    .eq("business_id", ctx.businessId)
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new SupabaseRepositoryError("commission.toggleRule.read", readErr);
  if (!current) throw new SupabaseRepositoryError("commission.toggleRule", new Error("Regla no encontrada."));
  const { data, error } = await sb
    .from("sales_commission_rules")
    .update({ active: !current.active, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.businessId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw failRepo("commission.toggleRule", error);
  return ruleRowToTs(data);
}

export async function deleteRule(ctx: RepoContext, id: string): Promise<void> {
  const sb = await getClient("commission.deleteRule");
  const { error } = await sb
    .from("sales_commission_rules")
    .delete()
    .eq("business_id", ctx.businessId)
    .eq("id", id);
  if (error) throw failRepo("commission.deleteRule", error);
}

/** Restablece las reglas del negocio al catálogo por defecto (Excel de referencia). */
export async function resetRules(ctx: RepoContext): Promise<CommissionRule[]> {
  const sb = await getClient("commission.resetRules");
  const { error } = await sb
    .from("sales_commission_rules")
    .delete()
    .eq("business_id", ctx.businessId);
  if (error) throw failRepo("commission.resetRules", error);
  await seedDefaultRules(sb, ctx);
  return selectRules(sb, ctx);
}

// ─── Exclusiones ─────────────────────────────────────────────────────────────

export async function listExclusions(ctx: RepoContext): Promise<CommissionExclusion[]> {
  const sb = await getClient("commission.listExclusions");
  const { data, error } = await sb
    .from("commission_exclusions")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false });
  if (error) throw new SupabaseRepositoryError("commission.listExclusions", error);
  return (data ?? []).map(exclusionRowToTs);
}

export async function upsertExclusion(
  ctx: RepoContext,
  input: { comprobante: string; reason: string; userName?: string },
): Promise<CommissionExclusion> {
  const sb = await getClient("commission.upsertExclusion");
  const { data, error } = await sb
    .from("commission_exclusions")
    .upsert(
      {
        business_id: ctx.businessId,
        comprobante: input.comprobante,
        reason: input.reason,
        user_name: input.userName ?? "Administrador",
      },
      { onConflict: "business_id,comprobante" },
    )
    .select("*")
    .single();
  if (error) throw failRepo("commission.upsertExclusion", error);
  return exclusionRowToTs(data);
}

export async function deleteExclusion(ctx: RepoContext, comprobante: string): Promise<void> {
  const sb = await getClient("commission.deleteExclusion");
  const { error } = await sb
    .from("commission_exclusions")
    .delete()
    .eq("business_id", ctx.businessId)
    .eq("comprobante", comprobante);
  if (error) throw failRepo("commission.deleteExclusion", error);
}

// ─── Estado de pago (payouts) ────────────────────────────────────────────────

export async function listPayouts(ctx: RepoContext): Promise<PayoutRecord[]> {
  const sb = await getClient("commission.listPayouts");
  const { data, error } = await sb
    .from("commission_payouts")
    .select("*")
    .eq("business_id", ctx.businessId);
  if (error) throw new SupabaseRepositoryError("commission.listPayouts", error);
  return (data ?? []).map(payoutRowToTs);
}

export async function setPayouts(
  ctx: RepoContext,
  input: { comprobantes: string[]; status: ManagedPayout; userName?: string; batchId?: string },
): Promise<PayoutRecord[]> {
  if (!input.comprobantes.length) return [];
  const sb = await getClient("commission.setPayouts");
  const at = new Date().toISOString();
  const rows = input.comprobantes.map((comprobante) => ({
    business_id: ctx.businessId,
    comprobante,
    status: input.status,
    user_name: input.userName ?? "Administrador",
    batch_id: input.batchId ?? null,
    at,
  }));
  const { data, error } = await sb
    .from("commission_payouts")
    .upsert(rows, { onConflict: "business_id,comprobante" })
    .select("*");
  if (error) throw failRepo("commission.setPayouts", error);
  return (data ?? []).map(payoutRowToTs);
}

export async function clearPayouts(ctx: RepoContext, comprobantes: string[]): Promise<void> {
  if (!comprobantes.length) return;
  const sb = await getClient("commission.clearPayouts");
  const { error } = await sb
    .from("commission_payouts")
    .delete()
    .eq("business_id", ctx.businessId)
    .in("comprobante", comprobantes);
  if (error) throw failRepo("commission.clearPayouts", error);
}

// ─── Auditoría ───────────────────────────────────────────────────────────────

export interface AuditInput {
  action: CommissionAuditAction;
  comprobantes: string[];
  amount?: number;
  batchId?: string;
  userName?: string;
  reason?: string;
}

export async function listAudit(ctx: RepoContext): Promise<CommissionAuditEntry[]> {
  const sb = await getClient("commission.listAudit");
  const { data, error } = await sb
    .from("commission_audit")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("at", { ascending: false })
    .limit(500);
  if (error) throw new SupabaseRepositoryError("commission.listAudit", error);
  return (data ?? []).map(auditRowToTs);
}

export async function recordAudit(
  ctx: RepoContext,
  input: AuditInput,
): Promise<CommissionAuditEntry> {
  const sb = await getClient("commission.recordAudit");
  const { data, error } = await sb
    .from("commission_audit")
    .insert({
      business_id: ctx.businessId,
      action: input.action,
      comprobantes: input.comprobantes,
      amount: input.amount ?? null,
      batch_id: input.batchId ?? null,
      user_name: input.userName ?? "Administrador",
      reason: input.reason ?? null,
    })
    .select("*")
    .single();
  if (error) throw failRepo("commission.recordAudit", error);
  return auditRowToTs(data);
}

// ─── Lotes de pago ───────────────────────────────────────────────────────────

export interface BatchInput {
  comprobantes: string[];
  total: number;
  periodFrom?: string;
  periodTo?: string;
  sellerId?: string;
  sellerName?: string;
  userName?: string;
}

export async function listBatches(ctx: RepoContext): Promise<CommissionBatch[]> {
  const sb = await getClient("commission.listBatches");
  const { data, error } = await sb
    .from("commission_payment_batches")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false });
  if (error) throw new SupabaseRepositoryError("commission.listBatches", error);
  return (data ?? []).map(batchRowToTs);
}

/**
 * Crea un lote de pago: inserta el lote, marca sus comisiones como pagadas
 * (con el `batch_id`) y registra la auditoría — la misma orquestación que hacía
 * `createBatch` en localStorage, ahora server-side para que sea consistente.
 */
export async function createBatch(ctx: RepoContext, input: BatchInput): Promise<CommissionBatch> {
  if (!input.comprobantes.length) {
    throw new SupabaseRepositoryError(
      "commission.createBatch",
      new Error("Selecciona al menos una comisión para el lote."),
    );
  }
  const sb = await getClient("commission.createBatch");
  const { data, error } = await sb
    .from("commission_payment_batches")
    .insert({
      business_id: ctx.businessId,
      period_from: input.periodFrom || null,
      period_to: input.periodTo || null,
      seller_id: input.sellerId || null,
      seller_name: input.sellerName ?? null,
      comprobantes: input.comprobantes,
      total: input.total,
      status: "paid",
      created_by: input.userName ?? "Administrador",
      paid_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw failRepo("commission.createBatch", error);
  const batch = batchRowToTs(data);

  // Marca las comisiones como pagadas + auditoría (mismas dos escrituras que el
  // store local encadenaba). Si alguna falla, el lote ya quedó creado; se
  // propaga el error para que la UI lo muestre.
  await setPayouts(ctx, {
    comprobantes: input.comprobantes,
    status: "paid",
    userName: input.userName,
    batchId: batch.id,
  });
  await recordAudit(ctx, {
    action: "batch_created",
    comprobantes: input.comprobantes,
    amount: input.total,
    batchId: batch.id,
    userName: input.userName,
    reason: input.sellerName ? `Lote de ${input.sellerName}` : "Lote de pago de comisión",
  });
  return batch;
}
