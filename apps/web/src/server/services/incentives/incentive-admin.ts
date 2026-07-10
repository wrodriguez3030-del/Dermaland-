import "server-only";
import { createServer, createServiceRoleClient } from "@/lib/supabase/server";
import { getRepositories } from "@/server/repositories";
import {
  computeIncentivesForSale,
  type IncentiveRule,
  type ProductInfo,
  type SaleForIncentive,
} from "@/features/incentives/incentive-engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function ruleRowToClient(row: Row) {
  return {
    id: row.id as string,
    name: row.name as string,
    ruleType: row.rule_type as IncentiveRule["ruleType"],
    productId: (row.product_id as string | null) ?? null,
    laboratoryId: (row.laboratory_id as string | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    percentage: (row.percentage as number | null) ?? null,
    fixedAmount: (row.fixed_amount as number | null) ?? null,
    minSalesAmount: (row.min_sales_amount as number | null) ?? null,
    startsAt: (row.starts_at as string | null) ?? null,
    endsAt: (row.ends_at as string | null) ?? null,
    active: Boolean(row.active),
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function ruleRowToEngine(row: Row): IncentiveRule {
  return {
    id: row.id,
    name: row.name,
    ruleType: row.rule_type,
    productId: row.product_id,
    laboratoryId: row.laboratory_id,
    categoryId: row.category_id,
    percentage: row.percentage,
    fixedAmount: row.fixed_amount,
    minSalesAmount: row.min_sales_amount,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    active: row.active,
  };
}

export function incentiveRowToClient(row: Row) {
  return {
    id: row.id as string,
    saleId: row.sale_id as string,
    saleNumber: (row.proformas?.number as string | undefined) ?? undefined,
    saleCashier: (row.proformas?.cashier_name as string | undefined) ?? undefined,
    saleCustomer: (row.proformas?.customer_name as string | undefined) ?? undefined,
    saleBranchId: (row.proformas?.branch_id as string | undefined) ?? undefined,
    sellerId: (row.seller_id as string | null) ?? null,
    sellerName: (row.seller_name as string | null) ?? null,
    ruleId: (row.rule_id as string | null) ?? null,
    ruleName: (row.rule_name as string | null) ?? null,
    ruleType: (row.rule_type as string | null) ?? null,
    productId: (row.product_id as string | null) ?? null,
    baseAmount: Number(row.base_amount ?? 0),
    incentiveAmount: Number(row.incentive_amount ?? 0),
    adjustmentAmount: Number(row.adjustment_amount ?? 0),
    status: row.status as
      | "pending"
      | "approved"
      | "paid"
      | "adjusted"
      | "voided"
      | "void",
    earnedAt: row.earned_at as string,
    paidAt: (row.paid_at as string | null) ?? null,
    paymentBatchId: (row.payment_batch_id as string | null) ?? null,
  };
}

export async function auditIncentive(
  session: { businessId: string; user: { id: string; fullName?: string } },
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  try {
    const repos = getRepositories();
    await repos.audit.log(
      { businessId: session.businessId, userId: session.user.id },
      {
        businessId: session.businessId,
        userId: session.user.id,
        userName: session.user.fullName ?? "",
        action,
        entity: "sales_incentive",
        entityId,
        metadata,
      },
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Devolución/anulación: marca como 'void' los incentivos pendientes o
 * aprobados de una venta anulada. Los ya PAGADOS NO se tocan (requieren
 * ajuste manual en el próximo pago) — se registran en la nota. No borra.
 * Devuelve cuántos se anularon y cuántos pagados quedaron para ajuste.
 */
export async function voidIncentivesForCancelledSale(
  saleId: string,
  reason: string,
): Promise<{ voided: number; adjusted: number; paidPending: number }> {
  const sb = await createServer();
  if (!sb) return { voided: 0, adjusted: 0, paidPending: 0 };

  const { data: existing } = await sb
    .from("sales_incentives")
    .select("id, status, incentive_amount")
    .eq("sale_id", saleId);
  if (!existing || existing.length === 0)
    return { voided: 0, adjusted: 0, paidPending: 0 };

  const now = new Date().toISOString();

  // Pendientes/aprobados → ANULADOS (aún no se pagó nada, no hay que recuperar).
  const toVoid = existing
    .filter((i: Row) => i.status === "pending" || i.status === "approved")
    .map((i: Row) => i.id);
  if (toVoid.length > 0) {
    await sb
      .from("sales_incentives")
      .update({
        status: "voided",
        note: `Venta anulada: ${reason}`.slice(0, 500),
        updated_at: now,
      })
      .in("id", toVoid);
  }

  // Pagados → AJUSTE NEGATIVO (§12): no se borra el original; se marca `adjusted`
  // con `adjustment_amount = -incentive_amount` → saldo de recuperación. El
  // reporte y Incentivos reflejan el mismo ajuste (netCommission = total + ajustes).
  const paid = existing.filter((i: Row) => i.status === "paid") as Array<{
    id: string;
    incentive_amount: number | string;
  }>;
  for (const i of paid) {
    await sb
      .from("sales_incentives")
      .update({
        status: "adjusted",
        adjustment_amount: -Math.abs(Number(i.incentive_amount) || 0),
        note: `Devolución/anulación (recuperación): ${reason}`.slice(0, 500),
        updated_at: now,
      })
      .eq("id", i.id);
  }

  return { voided: toVoid.length, adjusted: paid.length, paidPending: paid.length };
}

/**
 * Genera (idempotente) los incentivos de una venta pagada. Lee la venta +
 * ítems + productos, corre el motor y hace upsert con la restricción única
 * (sale_id, rule_id, product_id). Devuelve cuántos se generaron.
 */
export async function generateIncentivesForSaleServer(
  businessId: string,
  saleId: string,
): Promise<{ generated: number }> {
  const sb = await createServer();
  if (!sb) throw new Error("Supabase no configurado");

  const { data: sale, error: saleErr } = await sb
    .from("proformas")
    .select("id, seller_id, seller_name, status, created_at")
    .eq("id", saleId)
    .maybeSingle();
  if (saleErr) throw new Error(saleErr.message);
  if (!sale || !sale.seller_id) return { generated: 0 };

  const { data: items } = await sb
    .from("proforma_items")
    .select("product_id, quantity, subtotal")
    .eq("proforma_id", saleId);

  const { data: rules } = await sb
    .from("sales_incentive_rules")
    .select("*")
    .eq("active", true)
    .is("deleted_at", null);

  if (!rules || rules.length === 0) return { generated: 0 };

  // Info de productos para reglas por lab/categoría/margen.
  const productIds = [
    ...new Set((items ?? []).map((i: Row) => i.product_id).filter(Boolean)),
  ];
  const products = new Map<string, ProductInfo>();
  if (productIds.length > 0) {
    const { data: prods } = await sb
      .from("products")
      .select("id, laboratory_id, category_id, cost")
      .in("id", productIds as string[]);
    for (const p of prods ?? []) {
      products.set(p.id, {
        id: p.id,
        laboratoryId: p.laboratory_id,
        categoryId: p.category_id,
        cost: p.cost,
      });
    }
  }

  const saleForEngine: SaleForIncentive = {
    id: sale.id,
    sellerId: sale.seller_id,
    sellerName: sale.seller_name,
    createdAt: sale.created_at,
    status: sale.status,
    items: (items ?? []).map((i: Row) => ({
      productId: i.product_id ?? "",
      quantity: i.quantity,
      subtotal: Number(i.subtotal),
    })),
  };

  const snapshots = computeIncentivesForSale(
    saleForEngine,
    (rules as Row[]).map(ruleRowToEngine),
    products,
  );
  if (snapshots.length === 0) return { generated: 0 };

  // Upsert idempotente (ignora duplicados por la unique).
  const admin = createServiceRoleClient() ?? sb;
  const rows = snapshots.map((s) => ({
    business_id: businessId,
    sale_id: s.saleId,
    seller_id: s.sellerId,
    seller_name: s.sellerName,
    rule_id: s.ruleId,
    rule_name: s.ruleName,
    rule_type: s.ruleType,
    product_id: s.productId,
    base_amount: s.baseAmount,
    incentive_amount: s.incentiveAmount,
    status: "pending",
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (admin as any)
    .from("sales_incentives")
    .upsert(rows, { onConflict: "sale_id,rule_id,product_id", ignoreDuplicates: true });
  if (insErr) throw new Error(insErr.message);

  return { generated: snapshots.length };
}
