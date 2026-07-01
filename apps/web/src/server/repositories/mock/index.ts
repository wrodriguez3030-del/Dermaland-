/**
 * Adaptadores que envuelven los `mock-data/*` con la interfaz `Repositories`.
 *
 * Cada método respeta el `RepoContext.businessId` aunque mock data sea single-tenant —
 * así el código consumidor no asume nada sobre el origen.
 */

import type {
  AIRepository,
  ApiV3Repository,
  AuditRepository,
  BranchRepository,
  BrandRepository,
  BusinessRepository,
  CashRegisterRepository,
  CategoryRepository,
  CustomerRepository,
  DermatologyRefRepository,
  DgiiRepository,
  InventoryCountRepository,
  InventoryMovementRepository,
  LaboratoryRepository,
  PlanRepository,
  ProductLotRepository,
  ProductRepository,
  ProformaRepository,
  RecommendationRepository,
  RepoContext,
  Repositories,
  SubscriptionRepository,
  UserRepository,
  WarehouseRepository,
  WhatsappRepository,
} from "../types";

import type { Brand, Category, Customer, Laboratory, Product, ProductLot, Proforma } from "@/types";

import {
  mockBranches,
  mockBusiness,
  mockWarehouses,
} from "@/lib/mock-data/tenancy";
import {
  mockAuditLogs,
  mockCurrentUser,
  mockUsers,
} from "@/lib/mock-data/users";
import {
  mockBrands,
  mockCategories,
  mockLaboratories,
  mockProductLots,
  mockProducts,
  selectFefoLot,
  totalStockForProduct,
} from "@/lib/mock-data/catalog";
import {
  getCustomerById,
  getCustomerNotes,
  mockCustomers,
} from "@/lib/mock-data/customers";
import {
  getCurrentSession,
  getProformaById,
  mockCashRegisterSessions,
  mockProformas,
} from "@/lib/mock-data/sales";
import {
  getInventoryCountById,
  getItemsForCount,
  getScansForCount,
  mockInventoryCounts,
} from "@/lib/mock-data/inventory-counts";
import { mockInventoryMovements } from "@/lib/mock-data/inventory-movements";
import {
  mockRecommendations,
  mockRoutineTemplates,
  mockSkinConditions,
  mockSkinTypes,
} from "@/lib/mock-data/dermatology";
import {
  mockPlans,
  mockSubscriptions,
  mockUsageCounters,
} from "@/lib/mock-data/saas";
import {
  mockAIAgents,
  mockAILogs,
  mockApiKeys,
  mockDgiiSequences,
  mockElectronicInvoices,
  mockWebhooks,
  mockWhatsappConversations,
  mockWhatsappMessages,
  mockWhatsappTemplates,
} from "@/lib/mock-data/integrations";
import { daysUntil } from "@/lib/utils/format";
import { nextSkuFromSkus, nextSkuAfter } from "@/features/products/product-sku";
import type {
  SupplierInvoiceRepository,
  ExpenseRepository,
  RecurringExpenseRepository,
  SupplierRepository,
  ExpenseCategoryRepository,
  Supplier,
  ExpenseCategory,
} from "../types";
import type { SupplierInvoice, Expense, RecurringExpense, RecurringRun } from "@/features/purchases/compras-store";

const guard = (ctx: RepoContext) => {
  if (!ctx.businessId) throw new Error("RepoContext.businessId requerido");
};

// ─── Overlays de escritura para catálogo (no mutar los mock-data seed) ───────
let extraProducts: Product[] = [];
const deletedProductIds = new Set<string>();
const productPatches: Record<string, Partial<Product>> = {};

let extraBrands: Brand[] = [];
const deletedBrandIds = new Set<string>();
const brandPatches: Record<string, Partial<Brand>> = {};

let extraCategories: Category[] = [];
const deletedCategoryIds = new Set<string>();
const categoryPatches: Record<string, Partial<Category>> = {};

let extraLaboratories: Laboratory[] = [];
const deletedLaboratoryIds = new Set<string>();
const laboratoryPatches: Record<string, Partial<Laboratory>> = {};

export function __resetCatalogMockWrites(): void {
  extraProducts = [];
  deletedProductIds.clear();
  for (const k of Object.keys(productPatches)) delete productPatches[k];
  extraBrands = [];
  deletedBrandIds.clear();
  for (const k of Object.keys(brandPatches)) delete brandPatches[k];
  extraCategories = [];
  deletedCategoryIds.clear();
  for (const k of Object.keys(categoryPatches)) delete categoryPatches[k];
  extraLaboratories = [];
  deletedLaboratoryIds.clear();
  for (const k of Object.keys(laboratoryPatches)) delete laboratoryPatches[k];
}

// ─── Overlays de escritura para clientes ─────────────────────────────────────
let extraCustomers: Customer[] = [];
const deletedCustomerIds = new Set<string>();
const customerPatches: Record<string, Partial<Customer>> = {};

export function __resetCustomerMockWrites(): void {
  extraCustomers = [];
  deletedCustomerIds.clear();
  for (const k of Object.keys(customerPatches)) delete customerPatches[k];
}

function mockCustomersView(businessId: string): Customer[] {
  const applyPatch = (c: Customer): Customer =>
    customerPatches[c.id] ? { ...c, ...customerPatches[c.id] } : c;
  const base = mockCustomers
    .filter((c) => c.businessId === businessId)
    .map(applyPatch);
  const extra = extraCustomers
    .filter((c) => c.businessId === businessId)
    .map(applyPatch);
  return [...extra, ...base].filter((c) => !deletedCustomerIds.has(c.id));
}

// ─── Overlays de escritura para lotes ────────────────────────────────────────
let extraLots: ProductLot[] = [];
const lotQtyOverrides: Record<string, number> = {};

export function __resetLotMockWrites(): void {
  extraLots = [];
  for (const k of Object.keys(lotQtyOverrides)) delete lotQtyOverrides[k];
}

function mockLotsView(businessId: string): ProductLot[] {
  const applyQty = (l: ProductLot): ProductLot =>
    lotQtyOverrides[l.id] !== undefined
      ? { ...l, currentQuantity: lotQtyOverrides[l.id]! }
      : l;
  const base = mockProductLots.filter((l) => l.businessId === businessId).map(applyQty);
  const extra = extraLots.filter((l) => l.businessId === businessId).map(applyQty);
  return [...extra, ...base];
}

function mockProductsView(businessId: string): Product[] {
  const applyPatch = (p: Product): Product =>
    productPatches[p.id] ? { ...p, ...productPatches[p.id] } : p;
  const base = mockProducts
    .filter((p) => p.businessId === businessId)
    .map(applyPatch);
  const extra = extraProducts
    .filter((p) => p.businessId === businessId)
    .map(applyPatch);
  // `extra` va primero a propósito: el `list` aplica slice(0, limit ?? 100) y
  // el catálogo seed (Alegra) tiene cientos de filas; anteponer los productos
  // creados en runtime garantiza que sean visibles. Nota: el orden resultante
  // difiere del `order("name")` de Supabase — aceptable para el mock (los tests
  // no asertan orden).
  return [...extra, ...base].filter((p) => !deletedProductIds.has(p.id));
}

function mockGenId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const business: BusinessRepository = {
  async current(ctx) {
    guard(ctx);
    return ctx.businessId === mockBusiness.id ? mockBusiness : null;
  },
  async update(ctx, patch) {
    guard(ctx);
    return { ...mockBusiness, ...patch, updatedAt: new Date().toISOString() };
  },
};

const branch: BranchRepository = {
  async list(ctx, opts) {
    guard(ctx);
    return mockBranches.filter(
      (b) =>
        b.businessId === ctx.businessId &&
        (!opts?.activeOnly || b.status === "active"),
    );
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockBranches.find((b) => b.id === id && b.businessId === ctx.businessId) ?? null;
  },
  async create() {
    throw new Error("create() no disponible en backend mock — usa el store local");
  },
  async update() {
    throw new Error("update() no disponible en backend mock — usa el store local");
  },
  async softDelete() {
    throw new Error("softDelete() no disponible en backend mock — usa el store local");
  },
};

const warehouse: WarehouseRepository = {
  async list(ctx, branchId) {
    guard(ctx);
    return mockWarehouses.filter(
      (w) => w.businessId === ctx.businessId && (!branchId || w.branchId === branchId),
    );
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockWarehouses.find((w) => w.id === id && w.businessId === ctx.businessId) ?? null;
  },
};

const user: UserRepository = {
  async list(ctx) {
    guard(ctx);
    return mockUsers.filter((u) => u.businessId === ctx.businessId);
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockUsers.find((u) => u.id === id && u.businessId === ctx.businessId) ?? null;
  },
  async current() {
    return mockCurrentUser;
  },
};

const audit: AuditRepository = {
  async list(ctx, limit = 50) {
    guard(ctx);
    return mockAuditLogs
      .filter((l) => l.businessId === ctx.businessId)
      .slice(0, limit);
  },
  async log() {
    // no-op en mock
  },
};

const brand: BrandRepository = {
  async list(ctx) {
    guard(ctx);
    const applyPatch = (b: Brand): Brand =>
      brandPatches[b.id] ? { ...b, ...brandPatches[b.id] } : b;
    const base = mockBrands
      .filter((b) => b.businessId === ctx.businessId)
      .map(applyPatch);
    const extra = extraBrands
      .filter((b) => b.businessId === ctx.businessId)
      .map(applyPatch);
    return [...base, ...extra].filter((b) => !deletedBrandIds.has(b.id));
  },
  async byId(ctx, id) {
    guard(ctx);
    return (await brand.list(ctx)).find((b) => b.id === id) ?? null;
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const created: Brand = {
      id: mockGenId("br"),
      businessId: ctx.businessId,
      name: input.name,
      productCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    extraBrands.push(created);
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    brandPatches[id] = { ...(brandPatches[id] ?? {}), ...patch };
    const found = (await brand.list(ctx)).find((b) => b.id === id);
    if (!found) throw new Error("Marca no encontrada");
    return found;
  },
  async delete(ctx, id) {
    guard(ctx);
    deletedBrandIds.add(id);
  },
};

const category: CategoryRepository = {
  async list(ctx) {
    guard(ctx);
    const applyPatch = (c: Category): Category =>
      categoryPatches[c.id] ? { ...c, ...categoryPatches[c.id] } : c;
    const base = mockCategories
      .filter((c) => c.businessId === ctx.businessId)
      .map(applyPatch);
    const extra = extraCategories
      .filter((c) => c.businessId === ctx.businessId)
      .map(applyPatch);
    return [...base, ...extra].filter((c) => !deletedCategoryIds.has(c.id));
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const created: Category = {
      id: mockGenId("cat"),
      businessId: ctx.businessId,
      name: input.name,
      parentId: input.parentId ?? null,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };
    extraCategories.push(created);
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    categoryPatches[id] = { ...(categoryPatches[id] ?? {}), ...patch };
    const found = (await category.list(ctx)).find((c) => c.id === id);
    if (!found) throw new Error("Categoría no encontrada");
    return found;
  },
  async delete(ctx, id) {
    guard(ctx);
    deletedCategoryIds.add(id);
  },
};

const laboratory: LaboratoryRepository = {
  async list(ctx) {
    guard(ctx);
    const applyPatch = (l: Laboratory): Laboratory =>
      laboratoryPatches[l.id] ? { ...l, ...laboratoryPatches[l.id] } : l;
    const base = mockLaboratories
      .filter((l) => l.businessId === ctx.businessId)
      .map(applyPatch);
    const extra = extraLaboratories
      .filter((l) => l.businessId === ctx.businessId)
      .map(applyPatch);
    return [...base, ...extra].filter((l) => !deletedLaboratoryIds.has(l.id));
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const created: Laboratory = {
      id: mockGenId("lab"),
      businessId: ctx.businessId,
      name: input.name,
      country: input.country,
      createdAt: now,
      updatedAt: now,
    };
    extraLaboratories.push(created);
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    laboratoryPatches[id] = { ...(laboratoryPatches[id] ?? {}), ...patch };
    const found = (await laboratory.list(ctx)).find((l) => l.id === id);
    if (!found) throw new Error("Laboratorio no encontrado");
    return found;
  },
  async delete(ctx, id) {
    guard(ctx);
    deletedLaboratoryIds.add(id);
  },
};

const product: ProductRepository = {
  async list(ctx, opts) {
    guard(ctx);
    const q = (opts?.search ?? "").toLowerCase();
    return mockProductsView(ctx.businessId)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode?.includes(q))
      .filter((p) => !opts?.brandId || p.brandId === opts.brandId)
      .filter((p) => !opts?.categoryId || p.categoryId === opts.categoryId)
      .filter((p) => !opts?.activeOnly || p.active)
      .slice(0, opts?.limit ?? 100);
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockProductsView(ctx.businessId).find((p) => p.id === id) ?? null;
  },
  async byBarcode(ctx, barcode) {
    guard(ctx);
    return (
      mockProductsView(ctx.businessId).find((p) => p.barcode === barcode) ?? null
    );
  },
  async totalStock(ctx, productId) {
    guard(ctx);
    return totalStockForProduct(productId);
  },
  async nextSku(ctx) {
    guard(ctx);
    return nextSkuFromSkus(mockProductsView(ctx.businessId).map((p) => p.sku));
  },
  async create(ctx, input) {
    guard(ctx);
    const { businessId: _ignoredBusinessId, sku: providedSku, ...rest } = input;
    const now = new Date().toISOString();
    // SKU autoritativo: si no viene o choca, se genera secuencial.
    const existing = new Set(mockProductsView(ctx.businessId).map((p) => p.sku));
    let sku = (providedSku ?? "").trim() || nextSkuFromSkus([...existing]);
    while (existing.has(sku)) sku = nextSkuAfter(sku);
    const created: Product = {
      ...rest,
      sku,
      businessId: ctx.businessId,
      id: mockGenId("prod"),
      createdAt: now,
      updatedAt: now,
    };
    extraProducts.push(created);
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    const exists = mockProductsView(ctx.businessId).some((p) => p.id === id);
    if (!exists) throw new Error("Producto no encontrado");
    productPatches[id] = { ...(productPatches[id] ?? {}), ...patch };
    const found = mockProductsView(ctx.businessId).find((p) => p.id === id);
    if (!found) throw new Error("Producto no encontrado");
    return found;
  },
  async softDelete(ctx, id) {
    guard(ctx);
    deletedProductIds.add(id);
  },
};

const productLot: ProductLotRepository = {
  async list(ctx, opts) {
    guard(ctx);
    return mockLotsView(ctx.businessId)
      .filter((l) => !opts?.productId || l.productId === opts.productId)
      .filter((l) => !opts?.status || l.status === opts.status)
      .filter((l) => {
        if (opts?.expiringWithinDays == null) return true;
        const d = daysUntil(l.expiresAt);
        return d >= 0 && d <= opts.expiringWithinDays;
      });
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockLotsView(ctx.businessId).find((l) => l.id === id) ?? null;
  },
  async selectFefo(ctx, productId) {
    guard(ctx);
    return selectFefoLot(productId) ?? null;
  },
  async quarantine() {
    throw new Error("quarantine() requiere backend Supabase");
  },
  async release() {
    throw new Error("release() requiere backend Supabase");
  },
  async recall() {
    throw new Error("recall() requiere backend Supabase");
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const { businessId: _ignored, ...rest } = input;
    const created: ProductLot = {
      ...rest,
      businessId: ctx.businessId,
      id: mockGenId("lot"),
      status: input.status ?? "available",
      createdAt: now,
      updatedAt: now,
    };
    extraLots.push(created);
    return created;
  },
  async adjustQuantity(ctx, lotId, newQuantity) {
    guard(ctx);
    const lot = mockLotsView(ctx.businessId).find((l) => l.id === lotId);
    if (!lot) throw new Error(`Lote no encontrado: ${lotId}`);
    lotQtyOverrides[lotId] = newQuantity;
    return { ...lot, currentQuantity: newQuantity, updatedAt: new Date().toISOString() };
  },
};

const inventoryMovement: InventoryMovementRepository = {
  async list(ctx, opts) {
    guard(ctx);
    return mockInventoryMovements
      .filter((m) => m.businessId === ctx.businessId)
      .filter((m) => !opts?.productId || m.productId === opts.productId)
      .filter((m) => !opts?.lotId || m.lotId === opts.lotId)
      .slice(0, opts?.limit ?? 200);
  },
  async create() {
    throw new Error("create() requiere backend Supabase");
  },
};

const inventoryCount: InventoryCountRepository = {
  async list(ctx) {
    guard(ctx);
    return mockInventoryCounts.filter((c) => c.businessId === ctx.businessId);
  },
  async byId(ctx, id) {
    guard(ctx);
    const c = getInventoryCountById(id);
    return c && c.businessId === ctx.businessId ? c : null;
  },
  async scans(ctx, countId) {
    guard(ctx);
    return getScansForCount(countId);
  },
  async items(ctx, countId) {
    guard(ctx);
    return getItemsForCount(countId);
  },
  async recordScan() {
    // En mock siempre acepta — duplicados se manejarán cuando llegue Supabase
    // con índice único (offline_scan_id, device_id).
    return { inserted: true };
  },
  async submit() {},
  async approve() {},
  async reject() {},
};

const customer: CustomerRepository = {
  async list(ctx, opts) {
    guard(ctx);
    const q = (opts?.search ?? "").toLowerCase();
    return mockCustomersView(ctx.businessId)
      .filter((c) => !q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.phone ?? "").includes(q))
      .filter((c) => !opts?.tag || c.tags.includes(opts.tag));
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockCustomersView(ctx.businessId).find((c) => c.id === id) ?? null;
  },
  async notes(ctx, customerId) {
    guard(ctx);
    return getCustomerNotes(customerId);
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const created: Customer = {
      ...input,
      businessId: ctx.businessId,
      id: mockGenId("cust"),
      customerNumber: input.customerNumber ?? `CLI-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: now,
      updatedAt: now,
    };
    extraCustomers.push(created);
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    const exists = mockCustomersView(ctx.businessId).some((c) => c.id === id);
    if (!exists) throw new Error("Cliente no encontrado");
    customerPatches[id] = { ...(customerPatches[id] ?? {}), ...patch, updatedAt: new Date().toISOString() };
    const found = mockCustomersView(ctx.businessId).find((c) => c.id === id);
    if (!found) throw new Error("Cliente no encontrado");
    return found;
  },
  async softDelete(ctx, id) {
    guard(ctx);
    deletedCustomerIds.add(id);
  },
};

// ─── Overlays de escritura para proformas ───────────────────────────────────
let extraProformas: Proforma[] = [];
// C7: cancelledProformaIds eliminado — era write-only (nunca leído);
// los patches ya cubren el cancel (status: "cancelled" en proformaPatches).
const proformaPatches: Record<string, Partial<Proforma>> = {};

export function __resetProformaMockWrites(): void {
  extraProformas = [];
  for (const k of Object.keys(proformaPatches)) delete proformaPatches[k];
}

function mockProformasView(businessId: string): Proforma[] {
  const applyPatch = (p: Proforma): Proforma =>
    proformaPatches[p.id] ? { ...p, ...proformaPatches[p.id] } : p;
  const base = mockProformas.filter((p) => p.businessId === businessId).map(applyPatch);
  const extra = extraProformas.filter((p) => p.businessId === businessId).map(applyPatch);
  return [...extra, ...base];
}

// ─── Overlays de escritura para compras ──────────────────────────────────────
let extraInvoices: SupplierInvoice[] = [];
const deletedInvoiceIds = new Set<string>();
const invoicePatches: Record<string, Partial<SupplierInvoice>> = {};

let extraExpenses: Expense[] = [];
const deletedExpenseIds = new Set<string>();
const expensePatches: Record<string, Partial<Expense>> = {};

let extraRecurring: RecurringExpense[] = [];
const deletedRecurringIds = new Set<string>();
const recurringPatches: Record<string, Partial<RecurringExpense>> = {};

export function __resetPurchasesMockWrites(): void {
  extraInvoices = [];
  deletedInvoiceIds.clear();
  for (const k of Object.keys(invoicePatches)) delete invoicePatches[k];
  extraExpenses = [];
  deletedExpenseIds.clear();
  for (const k of Object.keys(expensePatches)) delete expensePatches[k];
  extraRecurring = [];
  deletedRecurringIds.clear();
  for (const k of Object.keys(recurringPatches)) delete recurringPatches[k];
}

function mockInvoicesView(businessId: string): SupplierInvoice[] {
  const applyPatch = (i: SupplierInvoice): SupplierInvoice =>
    invoicePatches[i.id] ? { ...i, ...invoicePatches[i.id] } : i;
  return extraInvoices
    .filter((i) => i.businessId === businessId)
    .map(applyPatch)
    .filter((i) => !deletedInvoiceIds.has(i.id));
}

function mockExpensesView(businessId: string): Expense[] {
  const applyPatch = (e: Expense): Expense =>
    expensePatches[e.id] ? { ...e, ...expensePatches[e.id] } : e;
  return extraExpenses
    .filter((e) => e.businessId === businessId)
    .map(applyPatch)
    .filter((e) => !deletedExpenseIds.has(e.id));
}

function mockRecurringView(businessId: string): RecurringExpense[] {
  const applyPatch = (r: RecurringExpense): RecurringExpense =>
    recurringPatches[r.id] ? { ...r, ...recurringPatches[r.id] } : r;
  return extraRecurring
    .filter((r) => r.businessId === businessId)
    .map(applyPatch)
    .filter((r) => !deletedRecurringIds.has(r.id));
}

const supplierInvoice: SupplierInvoiceRepository = {
  async list(ctx, opts) {
    guard(ctx);
    return mockInvoicesView(ctx.businessId)
      .filter((i) => !opts?.branchId || i.branchId === opts.branchId)
      .filter((i) => !opts?.status || i.status === opts.status)
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockInvoicesView(ctx.businessId).find((i) => i.id === id) ?? null;
  },
  async create(ctx, input) {
    guard(ctx);
    const n = new Date().toISOString();
    const subtotal = input.items.reduce((s, it) => s + it.quantity * it.unitCost, 0);
    const itbis = input.items.reduce((s, it) => s + (it.itbis || 0), 0);
    const discount = input.discount ?? 0;
    const total = Math.max(0, subtotal + itbis - discount);
    const created: SupplierInvoice = {
      id: mockGenId("pinv"),
      businessId: ctx.businessId,
      branchId: input.branchId ?? "",
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
      createdAt: n,
      updatedAt: n,
    };
    extraInvoices = [created, ...extraInvoices];
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    const exists = mockInvoicesView(ctx.businessId).some((i) => i.id === id);
    if (!exists) throw new Error("Factura no encontrada");
    invoicePatches[id] = { ...(invoicePatches[id] ?? {}), ...patch, updatedAt: new Date().toISOString() };
    const found = mockInvoicesView(ctx.businessId).find((i) => i.id === id);
    if (!found) throw new Error("Factura no encontrada");
    return found;
  },
  async softDelete(ctx, id) {
    guard(ctx);
    deletedInvoiceIds.add(id);
  },
  async void(ctx, id) {
    guard(ctx);
    return supplierInvoice.update(ctx, id, { status: "anulada" });
  },
  async registerPayment(ctx, id, amount) {
    guard(ctx);
    const inv = await supplierInvoice.byId(ctx, id);
    if (!inv) throw new Error("Factura no encontrada.");
    if (inv.status === "anulada") throw new Error("La factura está anulada.");
    if (!(amount > 0)) throw new Error("El monto debe ser mayor a 0.");
    const paid = Math.min(inv.total, inv.paid + amount);
    const status = paid >= inv.total ? "pagada" : "parcial";
    return supplierInvoice.update(ctx, id, { paid, status });
  },
};

const expense: ExpenseRepository = {
  async list(ctx, opts) {
    guard(ctx);
    return mockExpensesView(ctx.businessId)
      .filter((e) => opts?.branchId === undefined || e.branchId === opts.branchId)
      .filter((e) => opts?.petty === undefined || e.petty === opts.petty)
      .sort((a, b) => b.date.localeCompare(a.date));
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockExpensesView(ctx.businessId).find((e) => e.id === id) ?? null;
  },
  async create(ctx, input) {
    guard(ctx);
    const n = new Date().toISOString();
    const needsLast4 = input.method === "tarjeta" || input.method === "transferencia";
    const created: Expense = {
      id: mockGenId("exp"),
      businessId: ctx.businessId,
      branchId: input.branchId ?? "",
      date: input.date,
      category: input.category,
      payee: input.payee?.trim() ?? "",
      concept: input.concept.trim(),
      amount: input.amount,
      method: input.method,
      last4: needsLast4 ? (input.last4 ?? "").replace(/\D/g, "").slice(-4) || undefined : undefined,
      reference: !needsLast4 ? input.reference?.trim() || undefined : undefined,
      petty: !!input.petty,
      responsible: input.responsible?.trim() || undefined,
      status: "pagado",
      note: input.note?.trim() || undefined,
      createdAt: n,
      updatedAt: n,
    };
    extraExpenses = [created, ...extraExpenses];
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    const exists = mockExpensesView(ctx.businessId).some((e) => e.id === id);
    if (!exists) throw new Error("Gasto no encontrado");
    expensePatches[id] = { ...(expensePatches[id] ?? {}), ...patch, updatedAt: new Date().toISOString() };
    const found = mockExpensesView(ctx.businessId).find((e) => e.id === id);
    if (!found) throw new Error("Gasto no encontrado");
    return found;
  },
  async softDelete(ctx, id) {
    guard(ctx);
    deletedExpenseIds.add(id);
  },
  async void(ctx, id) {
    guard(ctx);
    return expense.update(ctx, id, { status: "anulado" });
  },
};

const recurringExpense: RecurringExpenseRepository = {
  async list(ctx) {
    guard(ctx);
    return mockRecurringView(ctx.businessId).sort((a, b) => a.name.localeCompare(b.name));
  },
  async byId(ctx, id) {
    guard(ctx);
    return mockRecurringView(ctx.businessId).find((r) => r.id === id) ?? null;
  },
  async create(ctx, input) {
    guard(ctx);
    const n = new Date().toISOString();
    const created: RecurringExpense = {
      id: mockGenId("rec"),
      businessId: ctx.businessId,
      branchId: input.branchId ?? "",
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
      createdAt: n,
      updatedAt: n,
    };
    extraRecurring = [created, ...extraRecurring];
    return created;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    const exists = mockRecurringView(ctx.businessId).some((r) => r.id === id);
    if (!exists) throw new Error("Pago recurrente no encontrado");
    recurringPatches[id] = { ...(recurringPatches[id] ?? {}), ...patch, updatedAt: new Date().toISOString() };
    const found = mockRecurringView(ctx.businessId).find((r) => r.id === id);
    if (!found) throw new Error("Pago recurrente no encontrado");
    return found;
  },
  async softDelete(ctx, id) {
    guard(ctx);
    deletedRecurringIds.add(id);
  },
  async setActive(ctx, id, active) {
    guard(ctx);
    return recurringExpense.update(ctx, id, { status: active ? "active" : "inactive" });
  },
  async generateRun(ctx, id) {
    guard(ctx);
    const r = await recurringExpense.byId(ctx, id);
    if (!r) throw new Error("Pago recurrente no encontrado.");
    if (r.status !== "active") throw new Error("El pago recurrente está inactivo.");
    const n = new Date().toISOString();
    const createdExpense = await expense.create(ctx, {
      businessId: ctx.businessId,
      date: n.slice(0, 10),
      category: r.category,
      payee: r.supplier ?? r.name,
      concept: `${r.name} (recurrente)`,
      amount: r.amount,
      method: r.method,
      branchId: r.branchId,
      note: "Generado desde pago recurrente",
    });
    const run: RecurringRun = {
      date: n.slice(0, 10),
      amount: r.amount,
      expenseId: createdExpense.id,
      paidAt: n,
    };
    const existingRuns = r.runs ?? [];
    await recurringExpense.update(ctx, id, { runs: [run, ...existingRuns] });
    return { expense: createdExpense, run };
  },
};

const proforma: ProformaRepository = {
  async list(ctx) {
    guard(ctx);
    return mockProformasView(ctx.businessId);
  },
  async byId(ctx, id) {
    guard(ctx);
    const all = mockProformasView(ctx.businessId);
    return all.find((p) => p.id === id) ?? null;
  },
  async create(ctx, input) {
    guard(ctx);
    const now = new Date().toISOString();
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    const newProforma: Proforma = {
      ...input,
      id: `prof_mock_${ts}_${rand}`,
      businessId: ctx.businessId,
      createdAt: now,
      updatedAt: now,
    };
    extraProformas = [newProforma, ...extraProformas];
    return newProforma;
  },
  async update(ctx, id, patch) {
    guard(ctx);
    const all = mockProformasView(ctx.businessId);
    const found = all.find((p) => p.id === id);
    if (!found) throw new Error(`Proforma ${id} no encontrada`);
    // Solo campos no fiscales.
    const safe: Record<string, unknown> = {};
    if (patch.customerName !== undefined) safe.customerName = patch.customerName;
    if (patch.customerPhone !== undefined) safe.customerPhone = patch.customerPhone ?? undefined;
    if (patch.customerDocument !== undefined)
      safe.customerDocument = patch.customerDocument ?? undefined;
    if (patch.notes !== undefined) safe.notes = patch.notes ?? undefined;
    proformaPatches[id] = {
      ...proformaPatches[id],
      ...safe,
      updatedAt: new Date().toISOString(),
    };
    const updated = mockProformasView(ctx.businessId).find((p) => p.id === id);
    return updated!;
  },
  async cancel(ctx, id, reason) {
    guard(ctx);
    const all = mockProformasView(ctx.businessId);
    const found = all.find((p) => p.id === id);
    if (!found) throw new Error(`Proforma ${id} no encontrada`);
    proformaPatches[id] = { ...proformaPatches[id], status: "cancelled", notes: reason };
  },
  async convertToEcf() {
    throw new Error("convertToEcf() requiere DGII activo y backend Supabase");
  },
};

const cashRegister: CashRegisterRepository = {
  async current(ctx) {
    guard(ctx);
    const s = getCurrentSession();
    return s && s.businessId === ctx.businessId ? s : null;
  },
  async history(ctx, limit = 30) {
    guard(ctx);
    return mockCashRegisterSessions
      .filter((s) => s.businessId === ctx.businessId)
      .slice(0, limit);
  },
  async open() {
    throw new Error("open() requiere backend Supabase");
  },
  async close() {
    throw new Error("close() requiere backend Supabase");
  },
  async movements() {
    return [];
  },
  async addMovement() {
    throw new Error("addMovement() requiere backend Supabase");
  },
};

const recommendation: RecommendationRepository = {
  async list(ctx, customerId) {
    guard(ctx);
    return mockRecommendations
      .filter((r) => r.businessId === ctx.businessId)
      .filter((r) => !customerId || r.customerId === customerId);
  },
  async byId(ctx, id) {
    guard(ctx);
    const r = mockRecommendations.find((x) => x.id === id);
    return r && r.businessId === ctx.businessId ? r : null;
  },
  async create() {
    throw new Error("create() requiere backend Supabase");
  },
};

const dermatologyRef: DermatologyRefRepository = {
  async skinTypes() {
    return mockSkinTypes;
  },
  async conditions() {
    return mockSkinConditions;
  },
  async routineTemplates() {
    return mockRoutineTemplates;
  },
};

const subscription: SubscriptionRepository = {
  async current(ctx) {
    guard(ctx);
    return mockSubscriptions.find((s) => s.businessId === ctx.businessId) ?? null;
  },
  async usage(ctx) {
    guard(ctx);
    return mockUsageCounters.filter((u) => u.businessId === ctx.businessId);
  },
};

const plan: PlanRepository = {
  async list() {
    return mockPlans;
  },
};

const whatsapp: WhatsappRepository = {
  async templates(ctx) {
    guard(ctx);
    return mockWhatsappTemplates;
  },
  async conversations(ctx) {
    guard(ctx);
    return mockWhatsappConversations;
  },
  async messages(ctx, conversationId) {
    guard(ctx);
    return mockWhatsappMessages.filter((m) => m.conversationId === conversationId);
  },
};

const ai: AIRepository = {
  async agents(ctx) {
    guard(ctx);
    return mockAIAgents;
  },
  async logs(ctx, limit = 50) {
    guard(ctx);
    return mockAILogs.slice(0, limit);
  },
};

const apiV3: ApiV3Repository = {
  async keys(ctx) {
    guard(ctx);
    return mockApiKeys;
  },
  async webhooks(ctx) {
    guard(ctx);
    return mockWebhooks;
  },
};

const DEFAULT_DGII_SETTINGS: import("../types").DgiiSettings = {
  rncEmisor: "13259077503",
  razonSocialEmisor: "DermaLand SRL",
  nombreComercial: "DermaLand",
  direccionEmisor:
    "Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este, Santiago",
  municipio: null,
  provincia: null,
  actividadEconomica: "Venta de productos dermatológicos",
  telefonoEmisor: "809-226-5252",
  correoEmisor: "fiscal@dermaland.do",
  website: null,
  ambiente: "testecf",
  dgiiEnabledRealSend: false,
  baseUrlTestecf: "https://ecf.dgii.gov.do/testecf",
  baseUrlCertecf: "https://ecf.dgii.gov.do/certecf",
  baseUrlEcf: "https://ecf.dgii.gov.do/ecf",
  defaultCashClosingEcfPercentage: 0,
  allowUserChangeClosingPercentage: false,
  minimumClosingEcfPercentage: 0,
  maximumClosingEcfPercentage: 100,
  requireAdminAuthorizationBelow100Percent: true,
  autoGenerateEcfOnCashClosing: false,
  appliesToPaymentMethods: ["cash", "transfer"] as const,
  updatedAt: new Date().toISOString(),
};

/**
 * Estado en memoria del proceso para `dgii_settings` (mock). Se pierde al
 * reiniciar. En Supabase real es la tabla `dgii_settings` con RLS.
 *
 * Map<businessId, DgiiSettings>
 */
const mockDgiiSettingsByBusiness = new Map<
  string,
  import("../types").DgiiSettings
>();
mockDgiiSettingsByBusiness.set("biz_dermaland", DEFAULT_DGII_SETTINGS);

const dgii: DgiiRepository = {
  async sequences(ctx) {
    guard(ctx);
    return mockDgiiSequences;
  },
  async invoices(ctx) {
    guard(ctx);
    return mockElectronicInvoices;
  },
  async settings(ctx) {
    guard(ctx);
    return mockDgiiSettingsByBusiness.get(ctx.businessId) ?? null;
  },
  async saveSettings(ctx, patch) {
    guard(ctx);
    const current =
      mockDgiiSettingsByBusiness.get(ctx.businessId) ?? DEFAULT_DGII_SETTINGS;
    const updated = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    mockDgiiSettingsByBusiness.set(ctx.businessId, updated);
    return updated;
  },
};

// ─── Overlays de escritura para suppliers / expense_categories ───────────────
let extraSuppliers: Supplier[] = [];
const supplierPatches: Record<string, Partial<Supplier>> = {};

let extraExpenseCategories: ExpenseCategory[] = [];

export function __resetLookupsMockWrites(): void {
  extraSuppliers = [];
  for (const k of Object.keys(supplierPatches)) delete supplierPatches[k];
  extraExpenseCategories = [];
}

function mockSuppliersView(businessId: string): Supplier[] {
  return extraSuppliers
    .filter((s) => s.businessId === businessId)
    .map((s) => supplierPatches[s.id] ? { ...s, ...supplierPatches[s.id] } : s);
}

function mockExpenseCategoriesView(businessId: string): ExpenseCategory[] {
  return extraExpenseCategories.filter((c) => c.businessId === businessId);
}

const supplier: SupplierRepository = {
  async list(ctx) {
    guard(ctx);
    return mockSuppliersView(ctx.businessId).sort((a, b) => a.name.localeCompare(b.name));
  },
  async create(ctx, input) {
    guard(ctx);
    const n = new Date().toISOString();
    const created: Supplier = {
      id: mockGenId("sup"),
      businessId: ctx.businessId,
      name: input.name.trim(),
      rnc: input.rnc?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim() || undefined,
      createdAt: n,
      updatedAt: n,
    };
    extraSuppliers = [created, ...extraSuppliers];
    return created;
  },
};

const expenseCategory: ExpenseCategoryRepository = {
  async list(ctx) {
    guard(ctx);
    return mockExpenseCategoriesView(ctx.businessId).sort((a, b) => a.name.localeCompare(b.name));
  },
  async create(ctx, input) {
    guard(ctx);
    const n = new Date().toISOString();
    const created: ExpenseCategory = {
      id: mockGenId("ecat"),
      businessId: ctx.businessId,
      name: input.name.trim(),
      createdAt: n,
    };
    extraExpenseCategories = [created, ...extraExpenseCategories];
    return created;
  },
};

export const mockRepositories: Repositories = {
  business,
  branch,
  warehouse,
  user,
  audit,
  brand,
  category,
  laboratory,
  product,
  productLot,
  inventoryMovement,
  inventoryCount,
  customer,
  proforma,
  cashRegister,
  recommendation,
  dermatologyRef,
  subscription,
  plan,
  whatsapp,
  ai,
  apiV3,
  dgii,
  supplierInvoice,
  expense,
  recurringExpense,
  supplier,
  expenseCategory,
};
