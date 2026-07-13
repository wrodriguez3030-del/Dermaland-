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
  CashMovement,
  CashMovementType,
  Category,
  Customer,
  CustomerNote,
  DgiiSequence,
  ElectronicInvoice,
  ID,
  InventoryCount,
  InventoryCountItem,
  InventoryCountScan,
  InventoryCountStatus,
  InventoryMovement,
  Laboratory,
  Plan,
  Payment,
  Product,
  ProductLot,
  Proforma,
  Recommendation,
  SaleItem,
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
import type {
  SupplierInvoice,
  Expense,
  RecurringExpense,
  RecurringRun,
  PaymentMethod,
  CreateInvoiceInput,
  CreateExpenseInput,
  CreateRecurringInput,
} from "@/features/purchases/compras-store";
import type { GlobalSearchResults } from "@/features/search/search-types";

// ─── Suppliers / ExpenseCategories ──────────────────────────────────────────

export interface Supplier {
  id: ID;
  businessId: ID;
  name: string;
  rnc?: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategory {
  id: ID;
  businessId: ID;
  name: string;
  createdAt: string;
}

// ─── Read context ────────────────────────────────────────────────────────────
//
// Pasa por toda query: identifica el tenant del usuario actual.
// Se obtiene del JWT en server-side (Server Component / Server Action).
//
export interface RepoContext {
  businessId: ID;
  branchId?: ID;
  userId?: ID;
  /**
   * Nombre del usuario autenticado (de la sesión/JWT). Se usa para persistir
   * identidad de auditoría (p.ej. `cashier_name`) SIN confiar en el body del
   * cliente. Mismo principio que `userId` (SEC-016).
   */
  userName?: string;
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
    /** Desplazamiento para paginar catálogos grandes (PostgREST corta en 1000 filas/request). */
    offset?: number;
  }): Promise<Product[]>;
  byId(ctx: RepoContext, id: ID): Promise<Product | null>;
  byBarcode(ctx: RepoContext, barcode: string): Promise<Product | null>;
  totalStock(ctx: RepoContext, productId: ID): Promise<number>;
  /** Próximo SKU secuencial del negocio (DERM-000001…). */
  nextSku(ctx: RepoContext): Promise<string>;
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
  /**
   * SEC-010: decrementa el stock de forma ATÓMICA (`current_quantity -= qty`
   * con guarda `>= qty` en una sola sentencia) — evita sobreventa por carrera.
   * Devuelve el lote actualizado, o `null` si no había stock suficiente.
   */
  decrementQuantity(ctx: RepoContext, lotId: ID, qty: number): Promise<ProductLot | null>;
}

export interface InventoryMovementRepository {
  list(ctx: RepoContext, opts?: { productId?: ID; lotId?: ID; limit?: number }): Promise<InventoryMovement[]>;
  create(ctx: RepoContext, movement: Omit<InventoryMovement, "id" | "createdAt">): Promise<InventoryMovement>;
}

// ─── Inventory counts (Phase 2.1) ───────────────────────────────────────────

/** Ítem al crear un conteo (sin ids de servidor; el repo los genera). */
export interface NewInventoryCountItem {
  productId: ID;
  productSku: string;
  productName: string;
  productLotId?: ID;
  lotNumber?: string;
  expiresAt?: string;
  warehouseId?: ID;
  expectedQuantity: number;
  countedQuantity: number;
  differenceQuantity?: number;
  status: InventoryCountItem["status"];
  lastScanAt?: string;
}

/**
 * Payload para persistir un conteo (cabecera + ítems). El repo genera los ids
 * de servidor (UUID), fija `business_id` del ctx (nunca del body) y resuelve el
 * almacén de la sucursal si no viene. NO muta stock — eso es un paso aparte.
 */
export interface NewInventoryCount {
  countNumber: string;
  branchId: ID;
  warehouseId?: ID;
  countType: InventoryCount["countType"];
  status?: InventoryCountStatus;
  assignedTo?: ID[];
  notes?: string;
  startedAt?: string;
  items: NewInventoryCountItem[];
}

export interface InventoryCountRepository {
  list(ctx: RepoContext): Promise<InventoryCount[]>;
  byId(ctx: RepoContext, id: ID): Promise<InventoryCount | null>;
  scans(ctx: RepoContext, countId: ID): Promise<InventoryCountScan[]>;
  items(ctx: RepoContext, countId: ID): Promise<InventoryCountItem[]>;
  /**
   * Persiste un conteo nuevo (cabecera + ítems) y devuelve la cabecera creada
   * con su id de servidor. `business_id` sale del ctx; el almacén se resuelve
   * de la sucursal si el input no lo trae.
   */
  create(ctx: RepoContext, input: NewInventoryCount): Promise<InventoryCount>;
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
  update(ctx: RepoContext, id: ID, patch: Partial<Customer>): Promise<Customer>;
  /** Soft delete: marca `deleted_at`. No borra físicamente. */
  softDelete(ctx: RepoContext, id: ID): Promise<void>;
}

// ─── Purchases / Compras ─────────────────────────────────────────────────────

export interface SupplierInvoiceRepository {
  list(ctx: RepoContext, opts?: { branchId?: ID; status?: string }): Promise<SupplierInvoice[]>;
  byId(ctx: RepoContext, id: ID): Promise<SupplierInvoice | null>;
  create(ctx: RepoContext, input: CreateInvoiceInput & { businessId: ID }): Promise<SupplierInvoice>;
  update(ctx: RepoContext, id: ID, patch: Partial<SupplierInvoice>): Promise<SupplierInvoice>;
  softDelete(ctx: RepoContext, id: ID): Promise<void>;
  /** Marca la factura como anulada (status → "anulada"). */
  void(ctx: RepoContext, id: ID): Promise<SupplierInvoice>;
  /** Registra un pago parcial o total sobre la factura. Actualiza paid+status. */
  registerPayment(ctx: RepoContext, id: ID, amount: number, method: PaymentMethod): Promise<SupplierInvoice>;
}

export interface ExpenseRepository {
  list(ctx: RepoContext, opts?: { branchId?: ID; petty?: boolean }): Promise<Expense[]>;
  byId(ctx: RepoContext, id: ID): Promise<Expense | null>;
  create(ctx: RepoContext, input: CreateExpenseInput & { businessId: ID }): Promise<Expense>;
  update(ctx: RepoContext, id: ID, patch: Partial<Expense>): Promise<Expense>;
  softDelete(ctx: RepoContext, id: ID): Promise<void>;
  /** Marca el gasto como anulado (status → "anulado"). */
  void(ctx: RepoContext, id: ID): Promise<Expense>;
}

export interface RecurringExpenseRepository {
  list(ctx: RepoContext): Promise<RecurringExpense[]>;
  byId(ctx: RepoContext, id: ID): Promise<RecurringExpense | null>;
  create(ctx: RepoContext, input: CreateRecurringInput & { businessId: ID }): Promise<RecurringExpense>;
  update(ctx: RepoContext, id: ID, patch: Partial<RecurringExpense>): Promise<RecurringExpense>;
  softDelete(ctx: RepoContext, id: ID): Promise<void>;
  /** Activa o desactiva el pago recurrente. */
  setActive(ctx: RepoContext, id: ID, active: boolean): Promise<RecurringExpense>;
  /** Genera el gasto del período: crea un Expense y registra la corrida. */
  generateRun(ctx: RepoContext, id: ID): Promise<{ expense: Expense; run: RecurringRun }>;
}

// ─── Suppliers lookup ─────────────────────────────────────────────────────────

export interface SupplierRepository {
  list(ctx: RepoContext): Promise<Supplier[]>;
  create(ctx: RepoContext, input: { name: string; rnc?: string; phone?: string; email?: string }): Promise<Supplier>;
}

// ─── ExpenseCategory lookup ───────────────────────────────────────────────────

export interface ExpenseCategoryRepository {
  list(ctx: RepoContext): Promise<ExpenseCategory[]>;
  create(ctx: RepoContext, input: { name: string }): Promise<ExpenseCategory>;
}

// ─── POS / Sales ────────────────────────────────────────────────────────────

export interface ProformaRepository {
  list(ctx: RepoContext): Promise<Proforma[]>;
  byId(ctx: RepoContext, id: ID): Promise<Proforma | null>;
  /**
   * Ventas de UN cliente (perfil): filtra en SERVIDOR por customer_id, con
   * fallback legacy por documento/teléfono normalizados para ventas sin id.
   * Trae ítems y pagos SOLO de esas ventas — nunca de todo el negocio.
   */
  listForCustomer(
    ctx: RepoContext,
    customer: Pick<Customer, "id" | "documentNumber" | "phone">,
  ): Promise<Proforma[]>;
  /**
   * Cabeceras de ventas para métricas agregadas (reporte de clientes):
   * solo columnas de cabecera, sin ítems ni pagos — payload liviano.
   */
  listHeaders(
    ctx: RepoContext,
    opts?: { branchId?: ID; from?: string; to?: string },
  ): Promise<Proforma[]>;
  create(ctx: RepoContext, proforma: Omit<Proforma, "id" | "createdAt" | "updatedAt">): Promise<Proforma>;
  /** Edición de datos NO fiscales (cliente del documento, notas). */
  update(ctx: RepoContext, id: ID, patch: ProformaEditPatch): Promise<Proforma>;
  /**
   * Edición COMPLETA (ítems, cantidades, precios, descuentos, pagos). El
   * servidor RECALCULA los totales desde los ítems (no confía en el cliente) y
   * reemplaza líneas/pagos. NUNCA cambia número, NCF/e-CF ni el tipo de
   * documento. Bloqueado para e-CF / anulados por la capa de editabilidad.
   */
  updateFull(ctx: RepoContext, id: ID, patch: ProformaFullEditPatch): Promise<Proforma>;
  cancel(ctx: RepoContext, id: ID, reason: string): Promise<void>;
  convertToEcf(ctx: RepoContext, id: ID): Promise<{ ecfNumber: string; trackId: string }>;
}

/** Campos editables seguros (no fiscales) de una proforma/factura. */
export interface ProformaEditPatch {
  customerName?: string;
  customerPhone?: string | null;
  customerDocument?: string | null;
  notes?: string | null;
}

/**
 * Patch de edición completa: además de los campos no fiscales, reemplaza ítems
 * y pagos. Los totales NO se envían — el servidor los recalcula desde `items`.
 */
export interface ProformaFullEditPatch extends ProformaEditPatch {
  items: SaleItem[];
  payments: Payment[];
  /** Descuento global en % (0–100). */
  discountPercent?: number;
  /** Datos operativos: cajero, estado (solo estados no fiscales). */
  cashierName?: string;
  status?: Proforma["status"];
  /** Fecha de emisión (ISO). Requiere permiso admin (validado en el servidor). */
  emittedAt?: string;
  /** Tipo de facturación (consumo/crédito fiscal). Solo si NO emitido. */
  billingType?: Proforma["billingType"];
}

export interface CashRegisterRepository {
  current(ctx: RepoContext): Promise<CashRegisterSession | null>;
  history(ctx: RepoContext, limit?: number): Promise<CashRegisterSession[]>;
  open(ctx: RepoContext, openingAmount: number): Promise<CashRegisterSession>;
  close(ctx: RepoContext, sessionId: ID, countedCash: number): Promise<CashRegisterSession>;
  /** Movimientos manuales de efectivo (ingresos/retiros/devoluciones) de una sesión. */
  movements(ctx: RepoContext, sessionId: ID): Promise<CashMovement[]>;
  addMovement(
    ctx: RepoContext,
    input: {
      sessionId: ID;
      type: CashMovementType;
      amount: number;
      method?: CashMovement["method"];
      reason?: string;
    },
  ): Promise<CashMovement>;
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

/**
 * Buscador global del sistema (barra superior). Una sola llamada devuelve
 * resultados agrupados por entidad. `businessId` viene del ctx (JWT), nunca del
 * cliente — RLS + filtro explícito por business_id (riesgo R-SEC-01).
 */
export interface SearchRepository {
  global(
    ctx: RepoContext,
    query: string,
    opts?: { perGroup?: number },
  ): Promise<GlobalSearchResults>;
}

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
  supplierInvoice: SupplierInvoiceRepository;
  expense: ExpenseRepository;
  recurringExpense: RecurringExpenseRepository;
  supplier: SupplierRepository;
  expenseCategory: ExpenseCategoryRepository;
  search: SearchRepository;
}
