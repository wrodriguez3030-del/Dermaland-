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

import type { Brand, Category, Laboratory, Product } from "@/types";

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
  getBrandById,
  getProductByBarcode,
  getProductById,
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
    return mockBrands.filter((b) => b.businessId === ctx.businessId);
  },
  async byId(ctx, id) {
    guard(ctx);
    const b = getBrandById(id);
    return b && b.businessId === ctx.businessId ? b : null;
  },
};

const category: CategoryRepository = {
  async list(ctx) {
    guard(ctx);
    return mockCategories.filter((c) => c.businessId === ctx.businessId);
  },
};

const laboratory: LaboratoryRepository = {
  async list(ctx) {
    guard(ctx);
    return mockLaboratories.filter((l) => l.businessId === ctx.businessId);
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
  async create(ctx, input) {
    guard(ctx);
    const { businessId: _ignoredBusinessId, ...rest } = input;
    const now = new Date().toISOString();
    const created: Product = {
      ...rest,
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
    return mockProductLots
      .filter((l) => l.businessId === ctx.businessId)
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
    return mockProductLots.find((l) => l.id === id && l.businessId === ctx.businessId) ?? null;
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
    return mockCustomers
      .filter((c) => c.businessId === ctx.businessId)
      .filter((c) => !q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q))
      .filter((c) => !opts?.tag || c.tags.includes(opts.tag));
  },
  async byId(ctx, id) {
    guard(ctx);
    const c = getCustomerById(id);
    return c && c.businessId === ctx.businessId ? c : null;
  },
  async notes(ctx, customerId) {
    guard(ctx);
    return getCustomerNotes(customerId);
  },
  async create() {
    throw new Error("create() requiere backend Supabase");
  },
};

const proforma: ProformaRepository = {
  async list(ctx) {
    guard(ctx);
    return mockProformas.filter((p) => p.businessId === ctx.businessId);
  },
  async byId(ctx, id) {
    guard(ctx);
    const p = getProformaById(id);
    return p && p.businessId === ctx.businessId ? p : null;
  },
  async create() {
    throw new Error("create() requiere backend Supabase");
  },
  async cancel() {},
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
};
