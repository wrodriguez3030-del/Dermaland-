/**
 * Interfaces de repositorios.
 *
 * Cada implementación (mock o Supabase) cumple este contrato.
 * Las páginas reciben datos vía `getRepositories()` (factory en `index.ts`)
 * y nunca importan implementaciones concretas — facilita el switch
 * mock ↔ Supabase con solo cambiar `DATA_SOURCE` en `.env`.
 *
 * Toda query debe filtrar por `businessId` en su firma. Ese parámetro
 * NUNCA viene del cliente — siempre del JWT verificado server-side
 * (ver `src/server/auth/`). Esto es la primera línea contra fugas
 * cross-tenant (riesgo R-SEC-01).
 */

import type {
  AIActionLog,
  AIAgent,
  ApiKey,
  AuditLog,
  Branch,
  Brand,
  Business,
  CashRegisterSession,
  Category,
  Customer,
  CustomerNote,
  DgiiSequence,
  ElectronicInvoice,
  ID,
  InventoryCount,
  InventoryCountItem,
  InventoryCountScan,
  InventoryMovement,
  Laboratory,
  Plan,
  Product,
  ProductLot,
  Proforma,
  Recommendation,
  RoutineTemplate,
  SkinCondition,
  SkinType,
  Subscription,
  UsageCounter,
  User,
  Warehouse,
  Webhook,
  WhatsappConversation,
  WhatsappMessage,
  WhatsappTemplate,
} from "@/types";

// ─── Read context ────────────────────────────────────────────────────────────
//
// Pasa por toda query: identifica el tenant del usuario actual.
// Se obtiene del JWT en server-side (Server Component / Server Action).
//
export interface RepoContext {
  businessId: ID;
  branchId?: ID;
  userId?: ID;
}

// ─── Tenancy ────────────────────────────────────────────────────────────────

export interface BusinessRepository {
  current(ctx: RepoContext): Promise<Business | null>;
  update(ctx: RepoContext, patch: Partial<Business>): Promise<Business>;
}

export interface BranchListOptions {
  /** Sólo sucursales activas (operación). Por defecto false = todas (admin). */
  activeOnly?: boolean;
}

export interface BranchRepository {
  list(ctx: RepoContext, opts?: BranchListOptions): Promise<Branch[]>;
  byId(ctx: RepoContext, id: ID): Promise<Branch | null>;
  create(ctx: RepoContext, branch: Omit<Branch, "id" | "createdAt" | "updatedAt">): Promise<Branch>;
  update(ctx: RepoContext, id: ID, patch: Partial<Branch>): Promise<Branch>;
  /** Soft delete: marca `deleted_at`. No borra físicamente. */
  softDelete(ctx: RepoContext, id: ID): Promise<void>;
}

export interface WarehouseRepository {
  list(ctx: RepoContext, branchId?: ID): Promise<Warehouse[]>;
  byId(ctx: RepoContext, id: ID): Promise<Warehouse | null>;
}

// ─── Users / Roles / Audit ──────────────────────────────────────────────────

export interface UserRepository {
  list(ctx: RepoContext): Promise<User[]>;
  byId(ctx: RepoContext, id: ID): Promise<User | null>;
  current(): Promise<User | null>;
}

export interface AuditRepository {
  list(ctx: RepoContext, limit?: number): Promise<AuditLog[]>;
  log(ctx: RepoContext, entry: Omit<AuditLog, "id" | "createdAt">): Promise<void>;
}

// ─── Catalog ────────────────────────────────────────────────────────────────

export interface BrandRepository {
  list(ctx: RepoContext): Promise<Brand[]>;
  byId(ctx: RepoContext, id: ID): Promise<Brand | null>;
  create(ctx: RepoContext, input: { name: string }): Promise<Brand>;
  update(ctx: RepoContext, id: ID, patch: { name?: string }): Promise<Brand>;
  delete(ctx: RepoContext, id: ID): Promise<void>;
}

export interface CategoryRepository {
  list(ctx: RepoContext): Promise<Category[]>;
  create(
    ctx: RepoContext,
    input: { name: string; parentId?: ID | null; description?: string },
  ): Promise<Category>;
  update(
    ctx: RepoContext,
    id: ID,
    patch: { name?: string; parentId?: ID | null; description?: string },
  ): Promise<Category>;
  delete(ctx: RepoContext, id: ID): Promise<void>;
}

export interface LaboratoryRepository {
  list(ctx: RepoContext): Promise<Laboratory[]>;
  create(ctx: RepoContext, input: { name: string; country?: string }): Promise<Laboratory>;
  update(ctx: RepoContext, id: ID, patch: { name?: string; country?: string }): Promise<Laboratory>;
  delete(ctx: RepoContext, id: ID): Promise<void>;
}

export interface ProductRepository {
  list(ctx: RepoContext, opts?: {
    search?: string;
    brandId?: ID;
    categoryId?: ID;
    activeOnly?: boolean;
    limit?: number;
  }): Promise<Product[]>;
  byId(ctx: RepoContext, id: ID): Promise<Product | null>;
  byBarcode(ctx: RepoContext, barcode: string): Promise<Product | null>;
  totalStock(ctx: RepoContext, productId: ID): Promise<number>;
  create(
    ctx: RepoContext,
    input: Omit<Product, "id" | "createdAt" | "updatedAt" | "deletedAt">,
  ): Promise<Product>;
  update(ctx: RepoContext, id: ID, patch: Partial<Product>): Promise<Product>;
  softDelete(ctx: RepoContext, id: ID): Promise<void>;
}

export interface ProductLotRepository {
  list(ctx: RepoContext, opts?: {
    productId?: ID;
    status?: ProductLot["status"];
    expiringWithinDays?: number;
  }): Promise<ProductLot[]>;
  byId(ctx: RepoContext, id: ID): Promise<ProductLot | null>;
  /** FEFO: lote más próximo a vencer disponible para el producto. */
  selectFefo(ctx: RepoContext, productId: ID): Promise<ProductLot | null>;
  quarantine(ctx: RepoContext, lotId: ID, reason: string): Promise<void>;
  release(ctx: RepoContext, lotId: ID): Promise<void>;
  recall(ctx: RepoContext, lotId: ID, reason: string): Promise<void>;
  /** Crea un lote nuevo con business_id del ctx (nunca del body). */
  create(
    ctx: RepoContext,
    input: Omit<ProductLot, "id" | "createdAt" | "updatedAt">,
  ): Promise<ProductLot>;
  /**
   * Ajuste absoluto de stock: setea `current_quantity` al valor indicado.
   * Devuelve el lote actualizado. El llamador es responsable de registrar
   * el movimiento de inventario correspondiente.
   */
  adjustQuantity(ctx: RepoContext, lotId: ID, newQuantity: number): Promise<ProductLot>;
}

export interface InventoryMovementRepository {
  list(ctx: RepoContext, opts?: { productId?: ID; lotId?: ID; limit?: number }): Promise<InventoryMovement[]>;
  create(ctx: RepoContext, movement: Omit<InventoryMovement, "id" | "createdAt">): Promise<InventoryMovement>;
}

// ─── Inventory counts (Phase 2.1) ───────────────────────────────────────────

export interface InventoryCountRepository {
  list(ctx: RepoContext): Promise<InventoryCount[]>;
  byId(ctx: RepoContext, id: ID): Promise<InventoryCount | null>;
  scans(ctx: RepoContext, countId: ID): Promise<InventoryCountScan[]>;
  items(ctx: RepoContext, countId: ID): Promise<InventoryCountItem[]>;
  /**
   * Registra un scan idempotentemente. Duplicados detectados por
   * (offline_scan_id, device_id) y rechazados sin error — evita doble conteo
   * cuando un dispositivo reintenta el sync.
   */
  recordScan(ctx: RepoContext, scan: Omit<InventoryCountScan, "id">): Promise<{ inserted: boolean }>;
  submit(ctx: RepoContext, countId: ID): Promise<void>;
  approve(ctx: RepoContext, countId: ID): Promise<void>;
  reject(ctx: RepoContext, countId: ID, reason: string): Promise<void>;
}

// ─── Customers ──────────────────────────────────────────────────────────────

export interface CustomerRepository {
  list(ctx: RepoContext, opts?: { search?: string; tag?: string }): Promise<Customer[]>;
  byId(ctx: RepoContext, id: ID): Promise<Customer | null>;
  notes(ctx: RepoContext, customerId: ID): Promise<CustomerNote[]>;
  create(ctx: RepoContext, customer: Omit<Customer, "id" | "createdAt" | "updatedAt">): Promise<Customer>;
}

// ─── POS / Sales ────────────────────────────────────────────────────────────

export interface ProformaRepository {
  list(ctx: RepoContext): Promise<Proforma[]>;
  byId(ctx: RepoContext, id: ID): Promise<Proforma | null>;
  create(ctx: RepoContext, proforma: Omit<Proforma, "id" | "createdAt" | "updatedAt">): Promise<Proforma>;
  cancel(ctx: RepoContext, id: ID, reason: string): Promise<void>;
  convertToEcf(ctx: RepoContext, id: ID): Promise<{ ecfNumber: string; trackId: string }>;
}

export interface CashRegisterRepository {
  current(ctx: RepoContext): Promise<CashRegisterSession | null>;
  history(ctx: RepoContext, limit?: number): Promise<CashRegisterSession[]>;
  open(ctx: RepoContext, openingAmount: number): Promise<CashRegisterSession>;
  close(ctx: RepoContext, sessionId: ID, countedCash: number): Promise<CashRegisterSession>;
}

// ─── Recommendations ────────────────────────────────────────────────────────

export interface RecommendationRepository {
  list(ctx: RepoContext, customerId?: ID): Promise<Recommendation[]>;
  byId(ctx: RepoContext, id: ID): Promise<Recommendation | null>;
  create(ctx: RepoContext, rec: Omit<Recommendation, "id" | "createdAt" | "updatedAt">): Promise<Recommendation>;
}

export interface DermatologyRefRepository {
  skinTypes(): Promise<SkinType[]>;
  conditions(): Promise<SkinCondition[]>;
  routineTemplates(): Promise<RoutineTemplate[]>;
}

// ─── SaaS / Platform ────────────────────────────────────────────────────────

export interface SubscriptionRepository {
  current(ctx: RepoContext): Promise<Subscription | null>;
  usage(ctx: RepoContext): Promise<UsageCounter[]>;
}

export interface PlanRepository {
  list(): Promise<Plan[]>;
}

// ─── Integrations (WA, IA, API, DGII) ───────────────────────────────────────

export interface WhatsappRepository {
  templates(ctx: RepoContext): Promise<WhatsappTemplate[]>;
  conversations(ctx: RepoContext): Promise<WhatsappConversation[]>;
  messages(ctx: RepoContext, conversationId: ID): Promise<WhatsappMessage[]>;
}

export interface AIRepository {
  agents(ctx: RepoContext): Promise<AIAgent[]>;
  logs(ctx: RepoContext, limit?: number): Promise<AIActionLog[]>;
}

export interface ApiV3Repository {
  keys(ctx: RepoContext): Promise<ApiKey[]>;
  webhooks(ctx: RepoContext): Promise<Webhook[]>;
}

/**
 * Configuración fiscal DGII por business — refleja la tabla
 * `dgii_settings` de la migración 0003. En modo mock se guarda en memoria
 * del proceso (se pierde al reiniciar). En Supabase se persiste con RLS
 * por tenant.
 */
export interface DgiiSettings {
  rncEmisor: string;
  razonSocialEmisor: string;
  nombreComercial: string | null;
  direccionEmisor: string;
  /** Código DGII 6 dígitos (formato `PPRRDD`). Ver `lib/dgii/dr-locations.ts`. */
  municipio: string | null;
  provincia: string | null;
  actividadEconomica: string | null;
  telefonoEmisor: string | null;
  correoEmisor: string | null;
  website: string | null;
  ambiente: "testecf" | "certecf" | "ecf";
  /**
   * Si false, el envío real a DGII está deshabilitado incluso si
   * `ambiente === "ecf"`. Sirve como guard adicional para evitar envíos
   * accidentales en producción.
   */
  dgiiEnabledRealSend: boolean;
  baseUrlTestecf: string;
  baseUrlCertecf: string;
  baseUrlEcf: string;
  defaultCashClosingEcfPercentage: number;
  allowUserChangeClosingPercentage: boolean;
  minimumClosingEcfPercentage: number;
  maximumClosingEcfPercentage: number;
  requireAdminAuthorizationBelow100Percent: boolean;
  autoGenerateEcfOnCashClosing: boolean;
  /** Métodos de pago a los que se aplica la conversión de cierre. */
  appliesToPaymentMethods: ReadonlyArray<string>;
  updatedAt: string;
}

export type DgiiSettingsPatch = Partial<
  Omit<DgiiSettings, "updatedAt">
>;

export interface DgiiRepository {
  sequences(ctx: RepoContext): Promise<DgiiSequence[]>;
  invoices(ctx: RepoContext): Promise<ElectronicInvoice[]>;
  /** Lee la configuración DGII del business. Devuelve null si no existe. */
  settings(ctx: RepoContext): Promise<DgiiSettings | null>;
  /**
   * Crea o actualiza la configuración DGII (upsert por business). El
   * caller debe haber verificado el permiso `dgii:configure`.
   */
  saveSettings(
    ctx: RepoContext,
    patch: DgiiSettingsPatch,
  ): Promise<DgiiSettings>;
}

// ─── Aggregate ──────────────────────────────────────────────────────────────

export interface Repositories {
  business: BusinessRepository;
  branch: BranchRepository;
  warehouse: WarehouseRepository;
  user: UserRepository;
  audit: AuditRepository;
  brand: BrandRepository;
  category: CategoryRepository;
  laboratory: LaboratoryRepository;
  product: ProductRepository;
  productLot: ProductLotRepository;
  inventoryMovement: InventoryMovementRepository;
  inventoryCount: InventoryCountRepository;
  customer: CustomerRepository;
  proforma: ProformaRepository;
  cashRegister: CashRegisterRepository;
  recommendation: RecommendationRepository;
  dermatologyRef: DermatologyRefRepository;
  subscription: SubscriptionRepository;
  plan: PlanRepository;
  whatsapp: WhatsappRepository;
  ai: AIRepository;
  apiV3: ApiV3Repository;
  dgii: DgiiRepository;
}
