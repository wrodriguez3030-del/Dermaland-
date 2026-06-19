import "server-only";
import type {
  SupplierInvoiceRepository,
  ExpenseRepository,
  RecurringExpenseRepository,
  RepoContext,
} from "../types";
import type {
  SupplierInvoice,
  Expense,
  RecurringExpense,
  CreateInvoiceInput,
  CreateExpenseInput,
  CreateRecurringInput,
} from "@/features/purchases/compras-store";
import { SupabaseRepositoryError, getClient } from "./client";
import {
  supplierInvoiceRowToTs,
  supplierInvoiceItemRowToTs,
  expenseRowToTs,
  recurringExpenseRowToTs,
  recurringRunRowToTs,
} from "./mappers";

// ─── Supplier invoices ────────────────────────────────────────────────────────

export const supplierInvoiceRepository: SupplierInvoiceRepository = {
  async list(ctx: RepoContext, opts) {
    const sb = await getClient("supplierInvoice.list");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (sb as any)
      .from("supplier_invoices")
      .select("*")
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false });
    if (opts?.branchId) q = q.eq("branch_id", opts.branchId);
    if (opts?.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw new SupabaseRepositoryError("supplierInvoice.list", error);

    const ids: string[] = (data ?? []).map((r: Record<string, unknown>) => r.id as string);
    if (ids.length === 0) return [];
    const { data: itemsData, error: itemsError } = await (sb as any)
      .from("supplier_invoice_items")
      .select("*")
      .in("invoice_id", ids);
    if (itemsError) throw new SupabaseRepositoryError("supplierInvoice.listItems", itemsError);

    const itemsByInvoice: Record<string, ReturnType<typeof supplierInvoiceItemRowToTs>[]> = {};
    for (const item of itemsData ?? []) {
      const inv = item.invoice_id as string;
      if (!itemsByInvoice[inv]) itemsByInvoice[inv] = [];
      itemsByInvoice[inv]!.push(supplierInvoiceItemRowToTs(item));
    }
    return (data ?? []).map((r: Record<string, unknown>) =>
      supplierInvoiceRowToTs(r, itemsByInvoice[r.id as string] ?? [])
    );
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("supplierInvoice.byId");
    const { data, error } = await (sb as any)
      .from("supplier_invoices")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("supplierInvoice.byId", error);
    if (!data) return null;

    const { data: itemsData, error: itemsError } = await (sb as any)
      .from("supplier_invoice_items")
      .select("*")
      .eq("invoice_id", id)
      .eq("business_id", ctx.businessId);
    if (itemsError) throw new SupabaseRepositoryError("supplierInvoice.byIdItems", itemsError);
    const items = (itemsData ?? []).map(supplierInvoiceItemRowToTs);
    return supplierInvoiceRowToTs(data, items);
  },

  async create(ctx: RepoContext, input: CreateInvoiceInput & { businessId: string }) {
    const sb = await getClient("supplierInvoice.create");
    const subtotal = input.items.reduce((s, it) => s + it.quantity * it.unitCost, 0);
    const itbis = input.items.reduce((s, it) => s + (it.itbis || 0), 0);
    const discount = input.discount ?? 0;
    const total = Math.max(0, subtotal + itbis - discount);

    const row = {
      business_id: ctx.businessId,
      branch_id: input.branchId ?? null,
      supplier_name: input.supplierName.trim(),
      supplier_rnc: input.supplierRnc?.trim() ?? null,
      number: input.number.trim(),
      ncf: input.ncf?.trim() ?? null,
      issue_date: input.issueDate,
      due_date: input.dueDate ?? null,
      payment_condition: input.paymentCondition ?? null,
      subtotal,
      itbis,
      discount,
      total,
      paid: 0,
      status: input.status ?? "pendiente",
      notes: input.notes ?? null,
    };

    const { data, error } = await (sb as any)
      .from("supplier_invoices")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("supplierInvoice.create", error);

    if (input.items.length > 0) {
      const itemRows = input.items.map((it) => ({
        business_id: ctx.businessId,
        invoice_id: data.id,
        product_id: it.productId ?? null,
        name: it.name,
        quantity: it.quantity,
        unit_cost: it.unitCost,
        itbis: it.itbis,
        total: it.total,
        lot_number: it.lotNumber ?? null,
        expiration_date: it.expiresAt ?? null,
        branch_id: it.branchId ?? input.branchId ?? null,
      }));
      const { error: itemsError } = await (sb as any)
        .from("supplier_invoice_items")
        .insert(itemRows);
      if (itemsError) throw new SupabaseRepositoryError("supplierInvoice.createItems", itemsError);
    }

    const { data: itemsData, error: itemsReadError } = await (sb as any)
      .from("supplier_invoice_items")
      .select("*")
      .eq("invoice_id", data.id)
      .eq("business_id", ctx.businessId);
    if (itemsReadError) throw new SupabaseRepositoryError("supplierInvoice.createItemsRead", itemsReadError);
    const items = (itemsData ?? []).map(supplierInvoiceItemRowToTs);
    return supplierInvoiceRowToTs(data, items);
  },

  async update(ctx: RepoContext, id: string, patch: Partial<SupplierInvoice>) {
    const sb = await getClient("supplierInvoice.update");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.supplierName !== undefined) row.supplier_name = patch.supplierName;
    if (patch.supplierRnc !== undefined) row.supplier_rnc = patch.supplierRnc ?? null;
    if (patch.number !== undefined) row.number = patch.number;
    if (patch.ncf !== undefined) row.ncf = patch.ncf ?? null;
    if (patch.issueDate !== undefined) row.issue_date = patch.issueDate;
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate ?? null;
    if (patch.paymentCondition !== undefined) row.payment_condition = patch.paymentCondition ?? null;
    if (patch.subtotal !== undefined) row.subtotal = patch.subtotal;
    if (patch.itbis !== undefined) row.itbis = patch.itbis;
    if (patch.discount !== undefined) row.discount = patch.discount;
    if (patch.total !== undefined) row.total = patch.total;
    if (patch.paid !== undefined) row.paid = patch.paid;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.notes !== undefined) row.notes = patch.notes ?? null;

    const { data, error } = await (sb as any)
      .from("supplier_invoices")
      .update(row)
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("supplierInvoice.update", error);
    const current = await this.byId(ctx, id);
    return supplierInvoiceRowToTs(data, current?.items ?? []);
  },

  async softDelete(ctx: RepoContext, id: string) {
    const sb = await getClient("supplierInvoice.softDelete");
    const { error } = await (sb as any)
      .from("supplier_invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", id);
    if (error) throw new SupabaseRepositoryError("supplierInvoice.softDelete", error);
  },
};

// ─── Expenses ────────────────────────────────────────────────────────────────

export const expenseRepository: ExpenseRepository = {
  async list(ctx: RepoContext, opts) {
    const sb = await getClient("expense.list");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (sb as any)
      .from("expenses")
      .select("*")
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false });
    if (opts?.branchId) q = q.eq("branch_id", opts.branchId);
    if (opts?.petty !== undefined) q = q.eq("petty", opts.petty);
    const { data, error } = await q;
    if (error) throw new SupabaseRepositoryError("expense.list", error);
    return (data ?? []).map(expenseRowToTs);
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("expense.byId");
    const { data, error } = await (sb as any)
      .from("expenses")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("expense.byId", error);
    return data ? expenseRowToTs(data) : null;
  },

  async create(ctx: RepoContext, input: CreateExpenseInput & { businessId: string }) {
    const sb = await getClient("expense.create");
    const needsLast4 = input.method === "tarjeta" || input.method === "transferencia";
    const last4 = needsLast4 ? (input.last4 ?? "").replace(/\D/g, "").slice(-4) || null : null;

    const row = {
      business_id: ctx.businessId,
      branch_id: input.branchId ?? null,
      expense_date: input.date,
      category: input.category,
      payee: input.payee?.trim() ?? null,
      concept: input.concept.trim(),
      amount: input.amount,
      method: input.method,
      last4,
      reference: !needsLast4 ? (input.reference?.trim() ?? null) : null,
      petty: !!input.petty,
      responsible: input.responsible?.trim() ?? null,
      status: "pagado",
      note: input.note?.trim() ?? null,
    };

    const { data, error } = await (sb as any)
      .from("expenses")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("expense.create", error);
    return expenseRowToTs(data);
  },

  async update(ctx: RepoContext, id: string, patch: Partial<Expense>) {
    const sb = await getClient("expense.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.date !== undefined) row.expense_date = patch.date;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.payee !== undefined) row.payee = patch.payee ?? null;
    if (patch.concept !== undefined) row.concept = patch.concept;
    if (patch.amount !== undefined) row.amount = patch.amount;
    if (patch.method !== undefined) row.method = patch.method;
    if (patch.last4 !== undefined) row.last4 = patch.last4 ?? null;
    if (patch.reference !== undefined) row.reference = patch.reference ?? null;
    if (patch.petty !== undefined) row.petty = patch.petty;
    if (patch.responsible !== undefined) row.responsible = patch.responsible ?? null;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.note !== undefined) row.note = patch.note ?? null;

    const { data, error } = await (sb as any)
      .from("expenses")
      .update(row)
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("expense.update", error);
    return expenseRowToTs(data);
  },

  async softDelete(ctx: RepoContext, id: string) {
    const sb = await getClient("expense.softDelete");
    const { error } = await (sb as any)
      .from("expenses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", id);
    if (error) throw new SupabaseRepositoryError("expense.softDelete", error);
  },
};

// ─── Recurring expenses ───────────────────────────────────────────────────────

export const recurringExpenseRepository: RecurringExpenseRepository = {
  async list(ctx: RepoContext) {
    const sb = await getClient("recurringExpense.list");
    const { data, error } = await (sb as any)
      .from("recurring_expenses")
      .select("*")
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) throw new SupabaseRepositoryError("recurringExpense.list", error);
    if (!data || data.length === 0) return [];

    const ids: string[] = data.map((r: Record<string, unknown>) => r.id as string);
    const { data: runsData, error: runsError } = await (sb as any)
      .from("recurring_expense_runs")
      .select("*")
      .in("recurring_id", ids)
      .order("run_date", { ascending: false });
    if (runsError) throw new SupabaseRepositoryError("recurringExpense.listRuns", runsError);

    const runsByRecurring: Record<string, ReturnType<typeof recurringRunRowToTs>[]> = {};
    for (const run of runsData ?? []) {
      const rid = run.recurring_id as string;
      if (!runsByRecurring[rid]) runsByRecurring[rid] = [];
      runsByRecurring[rid]!.push(recurringRunRowToTs(run));
    }
    return data.map((r: Record<string, unknown>) =>
      recurringExpenseRowToTs(r, runsByRecurring[r.id as string] ?? [])
    );
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("recurringExpense.byId");
    const { data, error } = await (sb as any)
      .from("recurring_expenses")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("recurringExpense.byId", error);
    if (!data) return null;

    const { data: runsData, error: runsError } = await (sb as any)
      .from("recurring_expense_runs")
      .select("*")
      .eq("recurring_id", id)
      .order("run_date", { ascending: false });
    if (runsError) throw new SupabaseRepositoryError("recurringExpense.byIdRuns", runsError);
    return recurringExpenseRowToTs(data, (runsData ?? []).map(recurringRunRowToTs));
  },

  async create(ctx: RepoContext, input: CreateRecurringInput & { businessId: string }) {
    const sb = await getClient("recurringExpense.create");
    const row = {
      business_id: ctx.businessId,
      branch_id: input.branchId ?? null,
      name: input.name.trim(),
      supplier: input.supplier?.trim() ?? null,
      category: input.category,
      amount: input.amount,
      frequency: input.frequency,
      pay_day: input.payDay ?? null,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      method: input.method,
      status: "active",
      note: input.note?.trim() ?? null,
    };
    const { data, error } = await (sb as any)
      .from("recurring_expenses")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("recurringExpense.create", error);
    return recurringExpenseRowToTs(data, []);
  },

  async update(ctx: RepoContext, id: string, patch: Partial<RecurringExpense>) {
    const sb = await getClient("recurringExpense.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.supplier !== undefined) row.supplier = patch.supplier ?? null;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.amount !== undefined) row.amount = patch.amount;
    if (patch.frequency !== undefined) row.frequency = patch.frequency;
    if (patch.payDay !== undefined) row.pay_day = patch.payDay ?? null;
    if (patch.startDate !== undefined) row.start_date = patch.startDate;
    if (patch.endDate !== undefined) row.end_date = patch.endDate ?? null;
    if (patch.method !== undefined) row.method = patch.method;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.note !== undefined) row.note = patch.note ?? null;

    const { data, error } = await (sb as any)
      .from("recurring_expenses")
      .update(row)
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("recurringExpense.update", error);
    const current = await this.byId(ctx, id);
    return recurringExpenseRowToTs(data, current?.runs ?? []);
  },

  async softDelete(ctx: RepoContext, id: string) {
    const sb = await getClient("recurringExpense.softDelete");
    const { error } = await (sb as any)
      .from("recurring_expenses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", id);
    if (error) throw new SupabaseRepositoryError("recurringExpense.softDelete", error);
  },
};
