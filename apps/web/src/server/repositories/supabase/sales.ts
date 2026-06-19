import "server-only";
import type {
  CashRegisterRepository,
  ProformaRepository,
  RepoContext,
} from "../types";
import type {
  CashRegisterSession,
  Payment,
  Proforma,
  SaleItem,
} from "@/types";
import { SupabaseRepositoryError, getClient } from "./client";
import {
  cashSessionRowToTs,
  proformaItemRowToTs,
  proformaPaymentRowToTs,
  proformaRowToTs,
} from "./mappers";

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function yyyymmdd(date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function generateProformaNumber(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PRO-${yyyymmdd()}-${pad4(rand)}`;
}

function generateSessionNumber(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SES-${yyyymmdd()}-${pad4(rand)}`;
}

// ─── Proforma ───────────────────────────────────────────────────────────────

async function fetchItemsForProformas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  businessId: string,
  proformaIds: string[],
): Promise<Map<string, SaleItem[]>> {
  const out = new Map<string, SaleItem[]>();
  if (proformaIds.length === 0) return out;
  const { data, error } = await sb
    .from("proforma_items")
    .select("*")
    .eq("business_id", businessId)
    .in("proforma_id", proformaIds)
    .order("line_no", { ascending: true });
  if (error) throw new SupabaseRepositoryError("proforma.items:fetch", error);
  for (const row of data ?? []) {
    const list = out.get(row.proforma_id) ?? [];
    list.push(proformaItemRowToTs(row));
    out.set(row.proforma_id, list);
  }
  return out;
}

async function fetchPaymentsForProformas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  businessId: string,
  proformaIds: string[],
): Promise<Map<string, Payment[]>> {
  const out = new Map<string, Payment[]>();
  if (proformaIds.length === 0) return out;
  const { data, error } = await sb
    .from("proforma_payments")
    .select("*")
    .eq("business_id", businessId)
    .in("proforma_id", proformaIds)
    .order("created_at", { ascending: true });
  if (error)
    throw new SupabaseRepositoryError("proforma.payments:fetch", error);
  for (const row of data ?? []) {
    const list = out.get(row.proforma_id) ?? [];
    list.push(proformaPaymentRowToTs(row));
    out.set(row.proforma_id, list);
  }
  return out;
}

export const proformaRepository: ProformaRepository = {
  async list(ctx: RepoContext) {
    const sb = await getClient("proforma.list");
    const { data, error } = await sb
      .from("proformas")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: false });
    if (error) throw new SupabaseRepositoryError("proforma.list", error);
    const rows = data ?? [];
    const ids = rows.map((r: { id: string }) => r.id);
    const itemsByProforma = await fetchItemsForProformas(
      sb,
      ctx.businessId,
      ids,
    );
    const paymentsByProforma = await fetchPaymentsForProformas(
      sb,
      ctx.businessId,
      ids,
    );
    return rows.map((r: { id: string } & Record<string, unknown>) =>
      proformaRowToTs(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r as any,
        itemsByProforma.get(r.id) ?? [],
        paymentsByProforma.get(r.id) ?? [],
      ),
    );
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("proforma.byId");
    const { data, error } = await sb
      .from("proformas")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("proforma.byId", error);
    if (!data) return null;
    const itemsByProforma = await fetchItemsForProformas(sb, ctx.businessId, [
      id,
    ]);
    const paymentsByProforma = await fetchPaymentsForProformas(
      sb,
      ctx.businessId,
      [id],
    );
    return proformaRowToTs(
      data,
      itemsByProforma.get(id) ?? [],
      paymentsByProforma.get(id) ?? [],
    );
  },

  async create(
    ctx: RepoContext,
    proforma: Omit<Proforma, "id" | "createdAt" | "updatedAt">,
  ) {
    const sb = await getClient("proforma.create");
    const number =
      proforma.number && proforma.number.trim().length > 0
        ? proforma.number
        : generateProformaNumber();

    const proformaRow = {
      business_id: ctx.businessId,
      branch_id: proforma.branchId,
      number,
      customer_id: proforma.customerId ?? null,
      customer_name: proforma.customerName,
      cashier_id: proforma.cashierId,
      cashier_name: proforma.cashierName,
      subtotal: proforma.subtotal,
      discount: proforma.discount,
      itbis: proforma.itbis,
      total: proforma.total,
      status: proforma.status,
      paid: proforma.paid,
      balance: proforma.balance,
      notes: proforma.notes ?? null,
      ecf_number: proforma.ecfNumber ?? null,
      cash_register_session_id: proforma.cashRegisterSessionId ?? null,
      discount_percent: proforma.discountPercent ?? null,
      discount_amount: proforma.discountAmount ?? null,
      billing_type: proforma.billingType ?? null,
      customer_phone: proforma.customerPhone ?? null,
      customer_document: proforma.customerDocument ?? null,
      amount_received: proforma.amountReceived ?? null,
      change_amount: proforma.changeAmount ?? null,
      document_kind: proforma.documentKind ?? "proforma",
      ecf_type: proforma.ecfType ?? null,
      sequence_type: proforma.sequenceType ?? null,
    };

    const { data: inserted, error } = await sb
      .from("proformas")
      .insert(proformaRow)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("proforma.create", error);

    const proformaId = inserted.id as string;

    // C2: compensating cleanup — si falla la inserción de items o payments,
    // borramos la proforma recién creada para no dejarla huérfana.
    // Esto NO es una transacción real (no hay rollback atómico); es compensación
    // best-effort. Para atomicidad real se requeriría una RPC/función Postgres.
    const rollbackProforma = async () => {
      await sb
        .from("proformas")
        .delete()
        .eq("id", proformaId)
        .eq("business_id", ctx.businessId);
    };

    // Items
    if (proforma.items?.length) {
      const itemRows = proforma.items.map((it, idx) => ({
        business_id: ctx.businessId,
        proforma_id: proformaId,
        line_no: idx + 1,
        product_id: it.productId || null,
        product_sku: it.productSku,
        product_name: it.productName,
        product_lot_id: it.lotId ?? null,
        lot_number: it.lotNumber ?? null,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        itbis_rate: it.itbisRate,
        discount: it.discount,
        subtotal: it.subtotal,
        itbis: it.itbis,
        total: it.total,
        kind: "product",
      }));
      const { error: iErr } = await sb.from("proforma_items").insert(itemRows);
      if (iErr) {
        await rollbackProforma();
        throw new SupabaseRepositoryError("proforma.create:items", iErr);
      }
    }

    // Payments
    if (proforma.payments?.length) {
      const payRows = proforma.payments.map((p) => ({
        business_id: ctx.businessId,
        proforma_id: proformaId,
        method_code: p.method,
        amount: p.amount,
        reference: p.reference ?? null,
        user_id: p.userId,
        user_name: p.userName,
      }));
      const { error: pErr } = await sb
        .from("proforma_payments")
        .insert(payRows);
      if (pErr) {
        await rollbackProforma();
        throw new SupabaseRepositoryError("proforma.create:payments", pErr);
      }
    }

    // Re-hidratamos para devolver el agregado completo con IDs reales.
    const itemsByProforma = await fetchItemsForProformas(sb, ctx.businessId, [
      proformaId,
    ]);
    const paymentsByProforma = await fetchPaymentsForProformas(
      sb,
      ctx.businessId,
      [proformaId],
    );
    return proformaRowToTs(
      inserted,
      itemsByProforma.get(proformaId) ?? [],
      paymentsByProforma.get(proformaId) ?? [],
    );
  },

  async cancel(ctx: RepoContext, id: string, reason: string) {
    const sb = await getClient("proforma.cancel");
    // C1: usar .select("id").maybeSingle() para detectar que la fila existe y
    // pertenece al tenant antes de aceptar silenciosamente 0 filas afectadas.
    const { data, error } = await sb
      .from("proformas")
      .update({
        status: "cancelled",
        notes: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("proforma.cancel", error);
    if (!data) throw new Error("Proforma no encontrada o no pertenece al negocio");
  },

  async convertToEcf(_ctx: RepoContext, _id: string) {
    // Fase G no autorizada — devolvemos mock placeholder. La conversión
    // real a e-CF (firmar XML, llamar DGII, persistir trackId) se hará en
    // la Fase G cuando los certificados y endpoints estén configurados.
    return { ecfNumber: "mock", trackId: "mock" };
  },
};

// ─── Cash register ──────────────────────────────────────────────────────────

async function fetchProformaIdsForSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  businessId: string,
  sessionId: string,
): Promise<string[]> {
  const { data, error } = await sb
    .from("proformas")
    .select("id")
    .eq("business_id", businessId)
    .eq("cash_register_session_id", sessionId);
  if (error)
    throw new SupabaseRepositoryError(
      "cashRegister.proformaIds:fetch",
      error,
    );
  return (data ?? []).map((r: { id: string }) => r.id);
}

export const cashRegisterRepository: CashRegisterRepository = {
  async current(ctx: RepoContext) {
    const sb = await getClient("cashRegister.current");
    const { data, error } = await sb
      .from("cash_register_sessions")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("cashRegister.current", error);
    if (!data) return null;
    const proformaIds = await fetchProformaIdsForSession(
      sb,
      ctx.businessId,
      data.id,
    );
    return cashSessionRowToTs(data, proformaIds);
  },

  async history(ctx: RepoContext, limit = 20) {
    const sb = await getClient("cashRegister.history");
    const { data, error } = await sb
      .from("cash_register_sessions")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (error) throw new SupabaseRepositoryError("cashRegister.history", error);
    const sessions: CashRegisterSession[] = [];
    for (const row of data ?? []) {
      const ids = await fetchProformaIdsForSession(
        sb,
        ctx.businessId,
        row.id,
      );
      sessions.push(cashSessionRowToTs(row, ids));
    }
    return sessions;
  },

  async open(ctx: RepoContext, openingAmount: number) {
    const sb = await getClient("cashRegister.open");

    if (!ctx.branchId) {
      throw new SupabaseRepositoryError(
        "cashRegister.open: ctx.branchId requerido para abrir caja",
      );
    }
    if (!ctx.userId) {
      throw new SupabaseRepositoryError(
        "cashRegister.open: ctx.userId requerido para registrar apertura",
      );
    }

    // Buscamos cash_register activa en la sucursal — política: una sola
    // caja registradora por sucursal en el MVP.
    const { data: cr, error: crErr } = await sb
      .from("cash_registers")
      .select("id")
      .eq("business_id", ctx.businessId)
      .eq("branch_id", ctx.branchId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (crErr)
      throw new SupabaseRepositoryError("cashRegister.open:lookup", crErr);
    if (!cr)
      throw new SupabaseRepositoryError(
        "cashRegister.open: Caja registradora no configurada para la sucursal",
      );

    // Nombre del cajero (rellenar via tabla users).
    const { data: u } = await sb
      .from("users")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle();
    const cashierName: string = u?.full_name ?? "Cajero";

    const row = {
      business_id: ctx.businessId,
      branch_id: ctx.branchId,
      cash_register_id: cr.id,
      session_number: generateSessionNumber(),
      opened_by: ctx.userId,
      opened_by_name: cashierName,
      opening_amount: openingAmount,
      expected_cash: openingAmount,
      status: "open" as const,
      totals: {},
    };

    const { data, error } = await sb
      .from("cash_register_sessions")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("cashRegister.open", error);
    return cashSessionRowToTs(data, []);
  },

  async close(ctx: RepoContext, sessionId: string, countedCash: number) {
    const sb = await getClient("cashRegister.close");

    // Necesitamos la sesión actual para calcular expected_cash y difference.
    const { data: current, error: e1 } = await sb
      .from("cash_register_sessions")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", sessionId)
      .maybeSingle();
    if (e1) throw new SupabaseRepositoryError("cashRegister.close:fetch", e1);
    if (!current)
      throw new SupabaseRepositoryError(
        "cashRegister.close: sesión no encontrada",
      );

    const expected = Number(current.expected_cash ?? 0);
    const difference = countedCash - expected;

    const { data, error } = await sb
      .from("cash_register_sessions")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: ctx.userId ?? null,
        counted_cash: countedCash,
        difference_amount: difference,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", ctx.businessId)
      .eq("id", sessionId)
      .eq("status", "open")
      .select("*")
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("cashRegister.close", error);
    if (!data)
      throw new SupabaseRepositoryError(
        "cashRegister.close: la sesión no existe o ya fue cerrada",
      );
    const proformaIds = await fetchProformaIdsForSession(
      sb,
      ctx.businessId,
      sessionId,
    );
    return cashSessionRowToTs(data, proformaIds);
  },
};

