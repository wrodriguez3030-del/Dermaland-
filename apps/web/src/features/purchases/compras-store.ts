"use client";

import * as React from "react";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { getCurrentSession } from "@/lib/mock-data/sales";
import { addLot } from "@/features/inventory/lot-store";
import { defaultWarehouseForBranch } from "@/features/tenancy/branch-store";

/**
 * Módulo de Compras — MVP (localStorage).
 *
 * Cubre: facturas de proveedor, gastos/pagos, gastos menores y pagos
 * recurrentes. Integra con inventario (entrada por lote = purchase_in) y avisa
 * sobre caja cuando el pago es en efectivo. Sólo guarda últimos 4 de tarjeta/
 * transferencia, nunca el número completo. RLS/scope por business_id.
 *
 * Producción: mapea a las tablas de la migración 0012 (suppliers,
 * supplier_invoices(+items), expenses, recurring_expenses(+runs)).
 */

export type PaymentMethod =
  | "efectivo"
  | "tarjeta"
  | "transferencia"
  | "cheque"
  | "otro";

export type InvoiceStatus =
  | "borrador"
  | "pendiente"
  | "parcial"
  | "pagada"
  | "vencida"
  | "anulada";

export type ExpenseStatus = "registrado" | "pendiente" | "pagado" | "anulado";

export type Frequency =
  | "semanal"
  | "quincenal"
  | "mensual"
  | "trimestral"
  | "anual";

export interface SupplierInvoiceItem {
  productId?: string;
  name: string;
  quantity: number;
  unitCost: number;
  /** ITBIS de la línea. */
  itbis: number;
  total: number;
  /** Datos de entrada a inventario (si es inventariable). */
  lotNumber?: string;
  expiresAt?: string;
  branchId?: string;
}

export interface SupplierInvoice {
  id: string;
  businessId: string;
  branchId: string;
  supplierName: string;
  supplierRnc?: string;
  number: string;
  ncf?: string;
  issueDate: string;
  dueDate?: string;
  paymentCondition?: string;
  items: SupplierInvoiceItem[];
  subtotal: number;
  itbis: number;
  discount: number;
  total: number;
  paid: number;
  status: InvoiceStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  businessId: string;
  branchId: string;
  date: string;
  category: string;
  payee: string;
  concept: string;
  amount: number;
  method: PaymentMethod;
  last4?: string;
  reference?: string;
  /** true = gasto menor (caja chica). */
  petty: boolean;
  responsible?: string;
  status: ExpenseStatus;
  note?: string;
  /** Aviso si el efectivo no pudo descontarse de caja (no había sesión abierta). */
  cashWarning?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringRun {
  date: string;
  amount: number;
  expenseId?: string;
  paidAt?: string;
}
export interface RecurringExpense {
  id: string;
  businessId: string;
  branchId: string;
  name: string;
  supplier?: string;
  category: string;
  amount: number;
  frequency: Frequency;
  payDay?: number;
  startDate: string;
  endDate?: string;
  method: PaymentMethod;
  status: "active" | "inactive";
  note?: string;
  runs: RecurringRun[];
  createdAt: string;
  updatedAt: string;
}

export const EXPENSE_CATEGORIES = [
  "Alquiler",
  "Servicios (luz/agua/internet)",
  "Suministros",
  "Transporte",
  "Mantenimiento",
  "Limpieza",
  "Mercadeo",
  "Software",
  "Nómina externa",
  "Impuestos",
  "Otros",
];

const K_INV = "dermaland.purchase.invoices";
const K_EXP = "dermaland.purchase.expenses";
const K_REC = "dermaland.purchase.recurring";
const EVENT = "dermaland:purchases-changed";

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}
function write<T>(key: string, list: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}
function genId(p: string) {
  return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
const now = () => new Date().toISOString();
const onlyDigits = (s: string | undefined) => (s ?? "").replace(/\D/g, "").slice(-4);

// ─── Backend gate (local vs Supabase) ────────────────────────────────────────
export const PURCHASES_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

function notifyPurchasesChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

// ─── Facturas de proveedor ────────────────────────────────────────────────────

export function listInvoices(): SupplierInvoice[] {
  return read<SupplierInvoice>(K_INV).sort(
    (a, b) => +new Date(b.issueDate) - +new Date(a.issueDate),
  );
}
export function getInvoice(id: string) {
  return listInvoices().find((i) => i.id === id);
}

export interface CreateInvoiceInput {
  supplierName: string;
  supplierRnc?: string;
  number: string;
  ncf?: string;
  issueDate: string;
  dueDate?: string;
  paymentCondition?: string;
  branchId: string;
  items: SupplierInvoiceItem[];
  discount?: number;
  notes?: string;
  status?: InvoiceStatus;
  /** Si true y los items tienen productId+lote+vencimiento, entra a inventario. */
  addToInventory?: boolean;
}

export type InvoiceResult =
  | { ok: true; invoice: SupplierInvoice }
  | { ok: false; error: string };

export function createInvoice(input: CreateInvoiceInput): InvoiceResult {
  if (!input.supplierName?.trim()) return { ok: false, error: "El proveedor es obligatorio." };
  if (!input.number?.trim()) return { ok: false, error: "El número de factura es obligatorio." };
  if (!input.branchId) return { ok: false, error: "La sucursal es obligatoria." };
  if (!input.items.length) return { ok: false, error: "Agrega al menos un producto/servicio." };

  const subtotal = input.items.reduce((s, it) => s + it.quantity * it.unitCost, 0);
  const itbis = input.items.reduce((s, it) => s + (it.itbis || 0), 0);
  const discount = input.discount ?? 0;
  const total = Math.max(0, subtotal + itbis - discount);

  const invoice: SupplierInvoice = {
    id: genId("pinv"),
    businessId: mockBusiness.id,
    branchId: input.branchId,
    supplierName: input.supplierName.trim(),
    supplierRnc: input.supplierRnc?.trim() || undefined,
    number: input.number.trim(),
    ncf: input.ncf?.trim() || undefined,
    issueDate: input.issueDate,
    dueDate: input.dueDate || undefined,
    paymentCondition: input.paymentCondition || undefined,
    items: input.items,
    subtotal,
    itbis,
    discount,
    total,
    paid: 0,
    status: input.status ?? "pendiente",
    notes: input.notes || undefined,
    createdAt: now(),
    updatedAt: now(),
  };

  write(K_INV, [invoice, ...read<SupplierInvoice>(K_INV)]);

  // Entrada a inventario (purchase_in) para items inventariables.
  if (input.addToInventory && invoice.status !== "borrador") {
    for (const it of input.items) {
      if (it.productId && it.lotNumber && it.quantity > 0) {
        addLot(
          {
            productId: it.productId,
            branchId: it.branchId ?? input.branchId,
            warehouseId: defaultWarehouseForBranch(it.branchId ?? input.branchId),
            lotNumber: it.lotNumber,
            initialQuantity: it.quantity,
            expiresAt: it.expiresAt ?? "",
            unitCost: it.unitCost,
            reason: `Compra ${invoice.number}`,
          },
          false,
        );
      }
    }
  }
  return { ok: true, invoice };
}

export function updateInvoice(id: string, patch: Partial<SupplierInvoice>): InvoiceResult {
  const list = read<SupplierInvoice>(K_INV);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: "Factura no encontrada." };
  const next = { ...list[i]!, ...patch, updatedAt: now() };
  list[i] = next;
  write(K_INV, list);
  return { ok: true, invoice: next };
}

export type PayResult = { ok: true } | { ok: false; error: string };
export function registerInvoicePayment(
  id: string,
  amount: number,
  _method: PaymentMethod,
): PayResult {
  const inv = getInvoice(id);
  if (!inv) return { ok: false, error: "Factura no encontrada." };
  if (inv.status === "anulada") return { ok: false, error: "La factura está anulada." };
  if (!(amount > 0)) return { ok: false, error: "El monto debe ser mayor a 0." };
  const paid = Math.min(inv.total, inv.paid + amount);
  const status: InvoiceStatus = paid >= inv.total ? "pagada" : "parcial";
  updateInvoice(id, { paid, status });
  return { ok: true };
}

export function voidInvoice(id: string): PayResult {
  const inv = getInvoice(id);
  if (!inv) return { ok: false, error: "Factura no encontrada." };
  updateInvoice(id, { status: "anulada" });
  return { ok: true };
}

export type DeleteResult = { ok: true } | { ok: false; error: string };
/** Elimina sólo borradores sin pagos. Lo demás se anula. */
export function deleteInvoice(id: string): DeleteResult {
  const inv = getInvoice(id);
  if (!inv) return { ok: false, error: "Factura no encontrada." };
  if (inv.paid > 0 || inv.status !== "borrador") {
    return {
      ok: false,
      error:
        "No se puede eliminar esta factura porque ya tiene movimientos o documentos asociados. Puedes anularla.",
    };
  }
  write(K_INV, read<SupplierInvoice>(K_INV).filter((x) => x.id !== id));
  return { ok: true };
}

// ─── Gastos / pagos (incluye gastos menores con petty=true) ────────────────────

export function listExpenses(petty?: boolean): Expense[] {
  const all = read<Expense>(K_EXP).sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return petty === undefined ? all : all.filter((e) => e.petty === petty);
}
export function getExpense(id: string) {
  return read<Expense>(K_EXP).find((e) => e.id === id);
}

export interface CreateExpenseInput {
  date: string;
  category: string;
  payee: string;
  concept: string;
  amount: number;
  method: PaymentMethod;
  last4?: string;
  reference?: string;
  branchId: string;
  petty?: boolean;
  responsible?: string;
  note?: string;
}
export type ExpenseResult =
  | { ok: true; expense: Expense }
  | { ok: false; error: string };

export function createExpense(input: CreateExpenseInput): ExpenseResult {
  if (!input.concept?.trim()) return { ok: false, error: "El concepto es obligatorio." };
  if (!(input.amount > 0)) return { ok: false, error: "El monto debe ser mayor a 0." };
  if (!input.branchId) return { ok: false, error: "La sucursal es obligatoria." };

  const needsLast4 = input.method === "tarjeta" || input.method === "transferencia";
  const cashWarning = input.method === "efectivo" && !getCurrentSession();

  const expense: Expense = {
    id: genId("exp"),
    businessId: mockBusiness.id,
    branchId: input.branchId,
    date: input.date,
    category: input.category,
    payee: input.payee.trim(),
    concept: input.concept.trim(),
    amount: input.amount,
    method: input.method,
    // Sólo últimos 4; nunca el número completo.
    last4: needsLast4 ? onlyDigits(input.last4) || undefined : undefined,
    reference: !needsLast4 ? input.reference?.trim() || undefined : undefined,
    petty: !!input.petty,
    responsible: input.responsible?.trim() || undefined,
    status: "pagado",
    note: input.note?.trim() || undefined,
    cashWarning,
    createdAt: now(),
    updatedAt: now(),
  };
  write(K_EXP, [expense, ...read<Expense>(K_EXP)]);
  return { ok: true, expense };
}

export function voidExpense(id: string): DeleteResult {
  const list = read<Expense>(K_EXP);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: "Gasto no encontrado." };
  list[i] = { ...list[i]!, status: "anulado", updatedAt: now() };
  write(K_EXP, list);
  return { ok: true };
}
export function deleteExpense(id: string): DeleteResult {
  const e = getExpense(id);
  if (!e) return { ok: false, error: "Gasto no encontrado." };
  if (e.status === "pagado") {
    return {
      ok: false,
      error: "No se puede eliminar un gasto pagado. Puedes anularlo.",
    };
  }
  write(K_EXP, read<Expense>(K_EXP).filter((x) => x.id !== id));
  return { ok: true };
}

// ─── Pagos recurrentes ──────────────────────────────────────────────────────

export function listRecurring(): RecurringExpense[] {
  return read<RecurringExpense>(K_REC).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
}
export function getRecurring(id: string) {
  return listRecurring().find((r) => r.id === id);
}

export interface CreateRecurringInput {
  name: string;
  supplier?: string;
  category: string;
  amount: number;
  frequency: Frequency;
  payDay?: number;
  startDate: string;
  endDate?: string;
  branchId: string;
  method: PaymentMethod;
  note?: string;
}
export type RecurringResult =
  | { ok: true; recurring: RecurringExpense }
  | { ok: false; error: string };

export function createRecurring(input: CreateRecurringInput): RecurringResult {
  if (!input.name?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  if (!(input.amount > 0)) return { ok: false, error: "El monto debe ser mayor a 0." };
  if (!input.branchId) return { ok: false, error: "La sucursal es obligatoria." };
  const r: RecurringExpense = {
    id: genId("rec"),
    businessId: mockBusiness.id,
    branchId: input.branchId,
    name: input.name.trim(),
    supplier: input.supplier?.trim() || undefined,
    category: input.category,
    amount: input.amount,
    frequency: input.frequency,
    payDay: input.payDay,
    startDate: input.startDate,
    endDate: input.endDate || undefined,
    method: input.method,
    status: "active",
    note: input.note?.trim() || undefined,
    runs: [],
    createdAt: now(),
    updatedAt: now(),
  };
  write(K_REC, [r, ...read<RecurringExpense>(K_REC)]);
  return { ok: true, recurring: r };
}

export function setRecurringActive(id: string, active: boolean): RecurringResult {
  const list = read<RecurringExpense>(K_REC);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: "Pago recurrente no encontrado." };
  list[i] = { ...list[i]!, status: active ? "active" : "inactive", updatedAt: now() };
  write(K_REC, list);
  return { ok: true, recurring: list[i]! };
}

export function updateRecurring(id: string, patch: CreateRecurringInput): RecurringResult {
  if (!patch.name?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  if (!(patch.amount > 0)) return { ok: false, error: "El monto debe ser mayor a 0." };
  const list = read<RecurringExpense>(K_REC);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: "Pago recurrente no encontrado." };
  list[i] = {
    ...list[i]!,
    name: patch.name.trim(),
    supplier: patch.supplier?.trim() || undefined,
    category: patch.category,
    amount: patch.amount,
    frequency: patch.frequency,
    payDay: patch.payDay,
    startDate: patch.startDate,
    endDate: patch.endDate || undefined,
    branchId: patch.branchId,
    method: patch.method,
    note: patch.note?.trim() || undefined,
    updatedAt: now(),
  };
  write(K_REC, list);
  return { ok: true, recurring: list[i]! };
}

/** Genera el gasto del período: crea un Expense y registra la corrida. */
export function generateRecurringRun(id: string): ExpenseResult {
  const r = getRecurring(id);
  if (!r) return { ok: false, error: "Pago recurrente no encontrado." };
  if (r.status !== "active") return { ok: false, error: "El pago recurrente está inactivo." };
  const exp = createExpense({
    date: now().slice(0, 10),
    category: r.category,
    payee: r.supplier ?? r.name,
    concept: `${r.name} (recurrente)`,
    amount: r.amount,
    method: r.method,
    branchId: r.branchId,
    note: "Generado desde pago recurrente",
  });
  if (!exp.ok) return exp;
  const list = read<RecurringExpense>(K_REC);
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) {
    list[i] = {
      ...list[i]!,
      runs: [
        { date: now().slice(0, 10), amount: r.amount, expenseId: exp.expense.id, paidAt: now() },
        ...list[i]!.runs,
      ],
      updatedAt: now(),
    };
    write(K_REC, list);
  }
  return exp;
}

export function deleteRecurring(id: string): DeleteResult {
  const r = getRecurring(id);
  if (!r) return { ok: false, error: "No encontrado." };
  if (r.runs.length > 0) {
    return {
      ok: false,
      error: "No se puede eliminar: tiene pagos generados. Puedes inactivarlo.",
    };
  }
  write(K_REC, read<RecurringExpense>(K_REC).filter((x) => x.id !== id));
  return { ok: true };
}

// ─── Resumen ──────────────────────────────────────────────────────────────────

export interface ComprasSummary {
  comprasMes: number;
  gastosPagados: number;
  gastosPendientes: number;
  cuentasPorPagar: number;
  gastosMenoresMes: number;
  recurrentesActivos: number;
}
export function comprasSummary(ref: Date = new Date()): ComprasSummary {
  const sameMonth = (d: string) => {
    const x = new Date(d);
    return x.getMonth() === ref.getMonth() && x.getFullYear() === ref.getFullYear();
  };
  const invoices = listInvoices().filter((i) => i.status !== "anulada");
  const expenses = listExpenses().filter((e) => e.status !== "anulado");
  return {
    comprasMes: invoices.filter((i) => sameMonth(i.issueDate)).reduce((s, i) => s + i.total, 0),
    gastosPagados: expenses.filter((e) => e.status === "pagado").reduce((s, e) => s + e.amount, 0),
    gastosPendientes: expenses
      .filter((e) => e.status === "pendiente" || e.status === "registrado")
      .reduce((s, e) => s + e.amount, 0),
    cuentasPorPagar: invoices.reduce((s, i) => s + Math.max(0, i.total - i.paid), 0),
    gastosMenoresMes: expenses
      .filter((e) => e.petty && sameMonth(e.date))
      .reduce((s, e) => s + e.amount, 0),
    recurrentesActivos: listRecurring().filter((r) => r.status === "active").length,
  };
}

export function clearLocalPurchases() {
  write(K_INV, []);
  write(K_EXP, []);
  write(K_REC, []);
}

// ─── Fetch helpers (Supabase mode) ──────────────────────────────────────────

export async function fetchInvoicesFromServer(): Promise<SupplierInvoice[]> {
  const res = await fetch("/api/supplier-invoices", { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { invoices: SupplierInvoice[] }).invoices;
}

export async function fetchExpensesFromServer(petty?: boolean): Promise<Expense[]> {
  const url = petty !== undefined
    ? `/api/expenses?petty=${petty}`
    : "/api/expenses";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { expenses: Expense[] }).expenses;
}

export async function fetchRecurringFromServer(): Promise<RecurringExpense[]> {
  const res = await fetch("/api/recurring-expenses", { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { recurring: RecurringExpense[] }).recurring;
}

// ─── Unified wrappers (dispatch local vs supabase) ───────────────────────────

export type InvoiceOpResult = InvoiceResult;

export async function saveInvoice(
  mode: "create" | "edit",
  input: CreateInvoiceInput,
  id?: string,
): Promise<InvoiceResult> {
  if (PURCHASES_BACKEND === "supabase") {
    try {
      if (mode === "create") {
        const res = await fetch("/api/supplier-invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { invoice?: SupplierInvoice; error?: string };
        if (!res.ok || !body.invoice) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
        notifyPurchasesChanged();
        return { ok: true, invoice: body.invoice };
      } else {
        const res = await fetch(`/api/supplier-invoices/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { invoice?: SupplierInvoice; error?: string };
        if (!res.ok || !body.invoice) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
        notifyPurchasesChanged();
        return { ok: true, invoice: body.invoice };
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return mode === "create" ? createInvoice(input) : updateInvoice(id!, input as Partial<SupplierInvoice>);
}

export async function deleteInvoiceAnywhere(id: string): Promise<DeleteResult> {
  if (PURCHASES_BACKEND === "supabase") {
    try {
      const res = await fetch(`/api/supplier-invoices/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      notifyPurchasesChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return deleteInvoice(id);
}

export async function saveExpense(
  mode: "create" | "edit",
  input: CreateExpenseInput,
  id?: string,
): Promise<ExpenseResult> {
  if (PURCHASES_BACKEND === "supabase") {
    try {
      if (mode === "create") {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { expense?: Expense; error?: string };
        if (!res.ok || !body.expense) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
        notifyPurchasesChanged();
        return { ok: true, expense: body.expense };
      } else {
        const res = await fetch(`/api/expenses/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { expense?: Expense; error?: string };
        if (!res.ok || !body.expense) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
        notifyPurchasesChanged();
        return { ok: true, expense: body.expense };
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return mode === "create" ? createExpense(input) : (() => {
    const list = read<Expense>(K_EXP);
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return { ok: false, error: "Gasto no encontrado." } as ExpenseResult;
    const next = { ...list[i]!, ...input, updatedAt: now() };
    list[i] = next;
    write(K_EXP, list);
    return { ok: true, expense: next } as ExpenseResult;
  })();
}

export async function deleteExpenseAnywhere(id: string): Promise<DeleteResult> {
  if (PURCHASES_BACKEND === "supabase") {
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      notifyPurchasesChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return deleteExpense(id);
}

export async function saveRecurring(
  mode: "create" | "edit",
  input: CreateRecurringInput,
  id?: string,
): Promise<RecurringResult> {
  if (PURCHASES_BACKEND === "supabase") {
    try {
      if (mode === "create") {
        const res = await fetch("/api/recurring-expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { recurring?: RecurringExpense; error?: string };
        if (!res.ok || !body.recurring) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
        notifyPurchasesChanged();
        return { ok: true, recurring: body.recurring };
      } else {
        const res = await fetch(`/api/recurring-expenses/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { recurring?: RecurringExpense; error?: string };
        if (!res.ok || !body.recurring) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
        notifyPurchasesChanged();
        return { ok: true, recurring: body.recurring };
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return mode === "create" ? createRecurring(input) : updateRecurring(id!, input);
}

export async function deleteRecurringAnywhere(id: string): Promise<DeleteResult> {
  if (PURCHASES_BACKEND === "supabase") {
    try {
      const res = await fetch(`/api/recurring-expenses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      notifyPurchasesChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return deleteRecurring(id);
}

// ─── Hooks server-aware ──────────────────────────────────────────────────────

export function useInvoices(): SupplierInvoice[] {
  const [list, setList] = React.useState<SupplierInvoice[]>([]);
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (PURCHASES_BACKEND === "supabase") {
        fetchInvoicesFromServer()
          .then((invoices) => { if (alive) setList(invoices); })
          .catch(() => { if (alive) setList(listInvoices()); });
      } else {
        setList(listInvoices());
      }
    };
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}

export function useExpenses(petty?: boolean): Expense[] {
  const [list, setList] = React.useState<Expense[]>([]);
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (PURCHASES_BACKEND === "supabase") {
        fetchExpensesFromServer(petty)
          .then((expenses) => { if (alive) setList(expenses); })
          .catch(() => { if (alive) setList(listExpenses(petty)); });
      } else {
        setList(listExpenses(petty));
      }
    };
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [petty]);
  return list;
}

export function useRecurring(): RecurringExpense[] {
  const [list, setList] = React.useState<RecurringExpense[]>([]);
  React.useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (PURCHASES_BACKEND === "supabase") {
        fetchRecurringFromServer()
          .then((recurring) => { if (alive) setList(recurring); })
          .catch(() => { if (alive) setList(listRecurring()); });
      } else {
        setList(listRecurring());
      }
    };
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      alive = false;
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}

// ─── Hook reactivo ──────────────────────────────────────────────────────────

export function usePurchasesTick(): number {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return tick;
}
