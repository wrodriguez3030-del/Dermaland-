export * from "./common";

import type { Audited, BranchScoped, BusinessScoped, ID, SoftDeletable } from "./common";

// ─────────────────────────────────────────────────────────────────────────────
// Tenancy
// ─────────────────────────────────────────────────────────────────────────────

export interface Business extends Audited, SoftDeletable {
  id: ID;
  legalName: string;
  commercialName: string;
  rnc: string;
  country: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagramUrl?: string;
  /** Sitio web público o link en bio (opcional). */
  website?: string;
  /** Dirección física de la empresa (usada en recibos y comprobantes). */
  address?: string;
  city?: string;
  province?: string;
  /** Eslogan comercial corto. */
  slogan?: string;
  /** Descripción / bio comercial breve. */
  description?: string;
  /** URL o ruta del logo institucional (PNG/SVG). */
  logoUrl?: string;
  dgiiEnabled: boolean;
  planId: ID;
  status: "active" | "suspended" | "trial" | "past_due";
}

export interface Branch extends Audited, SoftDeletable, BusinessScoped {
  id: ID;
  code: string;
  name: string;
  address: string;
  city: string;
  province: string;
  country: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isPilot: boolean;
  showOnWebsite: boolean;
  status: "active" | "inactive";
}

export interface Warehouse extends Audited, BranchScoped {
  id: ID;
  code: string;
  name: string;
  description?: string;
  isMain: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Users / Roles / Permissions / Audit
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "cashier"
  | "inventory"
  | "supervisor"
  | "auditor"
  | "vendedor";

export interface User extends Audited, SoftDeletable, BusinessScoped {
  id: ID;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  branchIds: ID[];
  twoFactorEnabled: boolean;
  status: "active" | "invited" | "disabled";
  lastLoginAt?: string;
  avatarColor: string;
}

export interface Permission {
  key: string;
  module: string;
  description: string;
}

export interface RoleDefinition {
  key: UserRole;
  label: string;
  description: string;
  permissions: string[];
}

export interface AuditLog extends BusinessScoped {
  id: ID;
  userId: ID;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  branchId?: ID;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog
// ─────────────────────────────────────────────────────────────────────────────

export interface Brand extends Audited, BusinessScoped {
  id: ID;
  name: string;
  productCount: number;
}

export interface Laboratory extends Audited, BusinessScoped {
  id: ID;
  name: string;
  country?: string;
  /** Tipo/categoría del laboratorio (p. ej. "Dermocosmética"). Solo UI. */
  type?: string;
}

export interface Category extends Audited, BusinessScoped {
  id: ID;
  name: string;
  parentId?: ID | null;
  description?: string;
}

export type PharmaceuticalForm =
  | "crema"
  | "locion"
  | "serum"
  | "gel"
  | "espuma"
  | "tableta"
  | "capsula"
  | "jarabe"
  | "shampoo"
  | "ampolla"
  | "spray"
  | "barra"
  | "mascarilla"
  | "otro";

export interface Product extends Audited, SoftDeletable, BusinessScoped {
  id: ID;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  brandId?: ID;
  laboratoryId?: ID;
  categoryId?: ID;
  unit: string;
  pharmaceuticalForm?: PharmaceuticalForm;
  presentation?: string;
  activeIngredient?: string;
  concentration?: string;
  sanitaryRegistry?: string;
  storageTemperature?: string;
  requiresPrescription: boolean;
  controlled: boolean;
  cost: number;
  price: number;
  itbisRate: number;
  minStock: number;
  maxStock: number;
  /**
   * URL de la imagen del producto.
   * MVP: data URL (base64) en localStorage, ruta a `/mock/products/*` o URL absoluta.
   * Producción: URL pública firmada de Supabase Storage / S3.
   */
  imageUrl?: string | null;
  /** Texto alternativo para accesibilidad. */
  imageAlt?: string | null;
  /** URL de origen (sitio oficial / distribuidor) — usada para auditoría y reimport. */
  imageSourceUrl?: string | null;
  /**
   * Estado de la importación de imagen del producto.
   * `linked` = imagen externa referenciada por URL (no descargada al repo).
   */
  imageStatus?: "downloaded" | "linked" | "needs_review" | "not_found" | "error" | null;
  active: boolean;
  sellable: boolean;
  // ── Enriquecimiento comercial (opcional, para vender mejor) ──
  /** Nombre corto para listas/POS. */
  shortName?: string;
  /** Contenido/tamaño (p. ej. "40 ml", "30 cápsulas"). */
  content?: string;
  /** Uso del producto (limpieza, protección solar, despigmentante…). */
  useType?: string;
  /** Tipo de piel ideal. */
  skinType?: string;
  /** Beneficios principales (bullets cortos). */
  benefits?: string[];
  /** Modo de uso simple. */
  modeOfUse?: string;
  /** Momento de uso: día / noche / ambos. */
  timeOfUse?: "dia" | "noche" | "ambos";
  /** Tip de venta para el personal. */
  salesTip?: string;
  /** Palabras clave para búsqueda interna. */
  keywords?: string[];
}

export type LotStatus =
  | "available"
  | "quarantine"
  | "expired"
  | "recalled"
  | "damaged"
  | "returned";

export interface ProductLot extends Audited, BranchScoped {
  id: ID;
  productId: ID;
  warehouseId: ID;
  warehouseLocationId?: ID;
  lotNumber: string;
  manufacturedAt?: string;
  expiresAt: string;
  receivedAt: string;
  initialQuantity: number;
  currentQuantity: number;
  unitCost: number;
  unitPrice?: number;
  supplierId?: ID;
  purchaseInvoice?: string;
  status: LotStatus;
  notes?: string;
}

export interface InventoryStockByLot extends BranchScoped {
  productId: ID;
  warehouseId: ID;
  lotId: ID;
  quantity: number;
  expiresAt: string;
  status: LotStatus;
}

export type MovementType =
  | "entry_purchase"
  | "exit_sale"
  | "transfer_out"
  | "transfer_in"
  | "adjustment_positive"
  | "adjustment_negative"
  | "return_in"
  | "return_out"
  | "quarantine"
  | "release"
  | "expiry"
  | "count_adjustment";

export interface InventoryMovement extends BranchScoped {
  id: ID;
  productId: ID;
  lotId?: ID;
  warehouseId: ID;
  type: MovementType;
  quantity: number;
  reason?: string;
  reference?: string;
  userId: ID;
  userName: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory counts (Phase 2.1)
// ─────────────────────────────────────────────────────────────────────────────

export type InventoryCountStatus =
  | "draft"
  | "in_progress"
  | "paused"
  | "submitted"
  | "reviewed"
  | "approved"
  | "rejected"
  | "adjusted"
  | "cancelled";

export interface InventoryCount extends BranchScoped, Audited {
  id: ID;
  countNumber: string;
  warehouseId: ID;
  countType: "full" | "partial" | "spot";
  status: InventoryCountStatus;
  assignedTo: ID[];
  startedAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  approvedAt?: string;
  cancelledAt?: string;
  reviewedBy?: ID;
  approvedBy?: ID;
  notes?: string;
  scanCount: number;
  itemCount: number;
}

export interface InventoryCountScan {
  id: ID;
  inventoryCountId: ID;
  productId: ID;
  productLotId?: ID;
  branchId: ID;
  warehouseId: ID;
  warehouseLocationId?: ID;
  barcode?: string;
  scannedQuantity: number;
  scanSource: "camera" | "bluetooth_scanner" | "manual";
  scannedBy: ID;
  scannedByName: string;
  scannedAt: string;
  deviceId: string;
  offlineScanId: string;
  syncStatus: "synced" | "pending" | "failed";
  notes?: string;
}

export interface InventoryCountItem {
  id: ID;
  inventoryCountId: ID;
  productId: ID;
  productSku: string;
  productName: string;
  productLotId?: ID;
  lotNumber?: string;
  expiresAt?: string;
  warehouseId: ID;
  expectedQuantity: number;
  countedQuantity: number;
  differenceQuantity: number;
  status: "match" | "shortage" | "overage" | "expired" | "unregistered";
  lastScanAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Customers (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipo de facturación por defecto del cliente. Mapea a e-CF DGII:
 *   - "consumo"        → e-CF tipo 32 (Factura de Consumo)
 *   - "credito_fiscal" → e-CF tipo 31 (Factura de Crédito Fiscal, requiere RNC)
 *
 * El POS preselecciona este tipo cuando se elige al cliente.
 */
export type DefaultBillingType = "consumo" | "credito_fiscal";

/**
 * Tipo de piel del cliente — campo estructurado a nivel de perfil.
 * Diferente de `SkinType`/`SkinTypeKey` (catálogo dermatológico) — este es el
 * registrado por el cliente/equipo y sirve como input para recomendaciones.
 */
export type CustomerSkinType =
  | "not_specified"
  | "normal"
  | "dry"
  | "oily"
  | "combination"
  | "sensitive"
  | "acne_prone"
  | "mature"
  | "hyperpigmentation"
  | "rosacea_reactive";

export interface Customer extends Audited, SoftDeletable, BusinessScoped {
  id: ID;
  customerNumber: string;
  firstName: string;
  lastName: string;
  documentType?: "cedula" | "rnc" | "passport";
  documentNumber?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  birthDate?: string;
  address?: string;
  city?: string;
  province?: string;
  source: "manual" | "whatsapp" | "web" | "import" | "agendapro";
  tags: string[];
  /** Tipo de comprobante por defecto al facturar. Default: "consumo". */
  defaultBillingType: DefaultBillingType;
  /** Tipo de piel registrado en el perfil. Input para recomendaciones. */
  skinType: CustomerSkinType;
  totalSpent: number;
  totalOrders: number;
  lastVisitAt?: string;
  notes?: string;
  consents: { templateId: string; grantedAt: string }[];
}

export interface CustomerNote {
  id: ID;
  customerId: ID;
  body: string;
  authorId: ID;
  authorName: string;
  createdAt: string;
  pinned: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales / POS / Cash register (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

export type ProformaStatus =
  | "draft"
  | "issued"
  | "paid"
  | "partially_paid"
  | "pending_ecf"
  | "converted_to_ecf"
  | "cancelled"
  | "expired";

export type PaymentMethod =
  | "cash"
  | "card"
  | "transfer"
  | "azul"
  | "cardnet"
  | "visanet"
  | "paypal"
  | "manual"
  | "other";

export interface SaleItem {
  productId: ID;
  productSku: string;
  productName: string;
  lotId?: ID;
  lotNumber?: string;
  quantity: number;
  unitPrice: number;
  itbisRate: number;
  discount: number;
  subtotal: number;
  itbis: number;
  total: number;
}

export interface Payment {
  id: ID;
  proformaId: ID;
  method: PaymentMethod;
  amount: number;
  /** Referencia de texto corta (p. ej. "otro método"). */
  reference?: string;
  /**
   * Últimos 4 dígitos de la tarjeta o referencia de transferencia, como
   * referencia administrativa. NUNCA se guarda el número completo, CVV ni
   * vencimiento.
   */
  last4?: string;
  userId: ID;
  userName: string;
  createdAt: string;
}

export interface Proforma extends Audited, BranchScoped {
  id: ID;
  number: string;
  customerId?: ID;
  customerName: string;
  cashierId: ID;
  cashierName: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  itbis: number;
  total: number;
  status: ProformaStatus;
  payments: Payment[];
  paid: number;
  balance: number;
  notes?: string;
  ecfNumber?: string;
  cashRegisterSessionId?: ID;
  // ── Campos extra capturados al emitir desde POS (opcionales) ──
  /** Descuento global aplicado en %. */
  discountPercent?: number;
  /** Monto descontado calculado (subtotal × pct/100). */
  discountAmount?: number;
  /** Tipo de comprobante elegido al cobrar. */
  billingType?: DefaultBillingType;
  /** Snapshot de teléfono y documento del cliente al momento de la venta. */
  customerPhone?: string;
  customerDocument?: string;
  /** Total recibido en efectivo (puede exceder al `total`). */
  amountReceived?: number;
  /** Vuelto entregado (`amountReceived - total`). */
  changeAmount?: number;
  /**
   * Documento que se emitió al cobrar — derivado de `billingType` +
   * `payments[0].method` por `resolveDocumentToIssue`. `proforma` no tiene
   * efecto fiscal; `invoice` queda preparada para emitir e-CF cuando el
   * módulo DGII esté activo.
   */
  documentKind?: "proforma" | "invoice";
  /** Tipo de e-CF (DGII) cuando `documentKind === "invoice"`. */
  ecfType?: "31" | "32";
  /** Secuencia DGII a usar — backend la materializa en producción. */
  sequenceType?: "consumo" | "credito_fiscal";
  /**
   * Numeración de `invoice_numberings` que reservó el comprobante
   * (modo supabase — reserva atómica en servidor, mig 0011/0018).
   */
  numberingId?: ID;
  /** Ambiente de la numeración al reservar (mock/demo/testecf/certecf). */
  sequenceEnvironment?: string;
  /** Vendedor responsable de la venta (users.id) — base de incentivos. */
  sellerId?: ID;
  /** Snapshot del nombre del vendedor al momento de la venta. */
  sellerName?: string;
  /**
   * Proforma ORIGEN cuando este documento es la factura que la convierte
   * (mig 0022). Las métricas cuentan solo el documento final: la proforma
   * referenciada queda visible en el historial pero no suma dos veces.
   */
  sourceProformaId?: ID;
  /**
   * SEC-011: clave de idempotencia generada por el cliente al iniciar un cobro.
   * El servidor la usa para no crear dos ventas ante doble-submit/reintento
   * (índice único `(business_id, idempotency_key)`).
   */
  idempotencyKey?: string;
  /**
   * B-02: plan de descuento de inventario (FEFO calculado en el POS). Cuando
   * viene presente, la emisión es ATÓMICA: el servidor crea la venta y descuenta
   * estos lotes en UNA transacción (RPC `emit_sale_atomic`). Si algún lote no
   * tiene stock, la venta COMPLETA se revierte. No se persiste en la proforma;
   * es solo entrada para la emisión.
   */
  stockDecrements?: { lotId: ID; qty: number; reason?: string }[];
}

export interface CashRegisterSession extends Audited, BranchScoped {
  id: ID;
  sessionNumber: string;
  cashierId: ID;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingAmount: number;
  expectedCash: number;
  countedCash?: number;
  difference?: number;
  totals: Record<PaymentMethod, number>;
  proformaIds: ID[];
  status: "open" | "closed";
  notes?: string;
}

export type CashMovementType = "income" | "withdrawal" | "refund";

/** Movimiento manual de efectivo del turno: ingreso, retiro o devolución. */
export interface CashMovement extends BranchScoped {
  id: ID;
  cashRegisterSessionId: ID;
  type: CashMovementType;
  /** Método del movimiento; solo "cash" afecta el efectivo físico de la caja. */
  method: PaymentMethod;
  amount: number;
  reason?: string;
  createdById?: ID;
  createdByName?: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendations (Phase 5)
// ─────────────────────────────────────────────────────────────────────────────

export type SkinTypeKey =
  | "dry"
  | "oily"
  | "combination"
  | "normal"
  | "sensitive"
  | "mature";

export interface SkinType {
  key: SkinTypeKey;
  label: string;
  description: string;
  characteristics: string[];
  recommendedIngredients: string[];
  avoidIngredients: string[];
}

export interface SkinCondition {
  id: ID;
  name: string;
  description: string;
  severity: "mild" | "moderate" | "severe";
  commonIngredients: string[];
  warnings: string[];
}

export interface RoutineTemplate {
  id: ID;
  name: string;
  skinTypes: SkinTypeKey[];
  conditions: ID[];
  steps: RoutineStep[];
  description: string;
}

export interface RoutineStep {
  order: number;
  moment: "morning" | "evening" | "weekly";
  category: string;
  productSuggestion?: string;
  instructions: string;
}

export interface Recommendation extends Audited, BusinessScoped {
  id: ID;
  customerId: ID;
  customerName: string;
  authorId: ID;
  authorName: string;
  skinType: SkinTypeKey;
  goals: string[];
  observedConditions: ID[];
  conditionLabels: string[];
  productIds: ID[];
  routineTemplateId?: ID;
  customRoutine?: RoutineStep[];
  instructions: string;
  followUpAt?: string;
  internalNotes?: string;
  status: "draft" | "delivered" | "follow_up" | "completed";
}

// ─────────────────────────────────────────────────────────────────────────────
// SaaS / Super Admin (Phase 7)
// ─────────────────────────────────────────────────────────────────────────────

export interface Plan {
  id: ID;
  name: string;
  monthlyPriceUSD: number;
  features: string[];
  limits: PlanLimits;
  highlight?: boolean;
}

export interface PlanLimits {
  users: number;
  branches: number;
  products: number;
  customers: number;
  whatsappMessages: number;
  apiRequests: number;
  storageGB: number;
  reportsAdvanced: boolean;
  aiEnabled: boolean;
  dgiiEnabled: boolean;
}

export interface Subscription {
  id: ID;
  businessId: ID;
  businessName: string;
  planId: ID;
  planName: string;
  status: "trial" | "active" | "past_due" | "suspended" | "cancelled";
  trialEndsAt?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  monthlyPriceUSD: number;
  paymentMethod?: PaymentMethod;
  lastPaymentAt?: string;
}

export interface UsageCounter {
  businessId: ID;
  metric: keyof PlanLimits;
  used: number;
  limit: number;
  resetAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp / IA / API V3 / DGII (Phase 8 — structure only)
// ─────────────────────────────────────────────────────────────────────────────

export interface WhatsappTemplate {
  id: ID;
  name: string;
  category: "marketing" | "transactional" | "service";
  status: "approved" | "pending" | "rejected";
  body: string;
  language: "es";
  variables: string[];
}

export interface WhatsappConversation {
  id: ID;
  customerId?: ID;
  customerName: string;
  phone: string;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string;
  status: "open" | "handoff" | "closed";
  assignedTo?: ID;
}

export interface WhatsappMessage {
  id: ID;
  conversationId: ID;
  direction: "inbound" | "outbound";
  body: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "received";
  createdAt: string;
}

export interface AIAgent {
  id: ID;
  name: string;
  model: "gpt-4o-mini" | "gpt-4o" | "claude-haiku-4-5";
  active: boolean;
  toolsAllowed: string[];
  monthlyCallsLimit: number;
  monthlyCallsUsed: number;
  systemPrompt: string;
}

export interface AIActionLog {
  id: ID;
  agentId: ID;
  agentName: string;
  customerId?: ID;
  tool: string;
  status: "success" | "error" | "handoff";
  durationMs: number;
  costUSD: number;
  createdAt: string;
}

export interface ApiKey {
  id: ID;
  name: string;
  prefix: string;
  scopes: string[];
  status: "active" | "revoked";
  lastUsedAt?: string;
  rateLimitPerMinute: number;
  createdAt: string;
}

export interface Webhook {
  id: ID;
  url: string;
  events: string[];
  status: "active" | "disabled";
  failureCount: number;
  lastDeliveryAt?: string;
}

export interface DgiiSequence {
  type: "31" | "32" | "33" | "34" | "41" | "43" | "44" | "45";
  label: string;
  rangeStart: number;
  rangeEnd: number;
  nextNumber: number;
  expiresAt: string;
  status: "active" | "expiring" | "exhausted";
}

export interface ElectronicInvoice {
  id: ID;
  ecfType: DgiiSequence["type"];
  ecfNumber: string;
  customerName: string;
  amount: number;
  itbis: number;
  total: number;
  status:
    | "draft"
    | "signed"
    | "submitted"
    | "in_process"
    | "accepted"
    | "accepted_conditional"
    | "rejected"
    | "cancelled"
    | "error";
  trackId?: string;
  qrCode?: string;
  createdAt: string;
  submittedAt?: string;
}
