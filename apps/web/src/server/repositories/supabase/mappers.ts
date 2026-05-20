/**
 * Mappers snake_case (Supabase row) ↔ camelCase (TS).
 *
 * Funciones puras, sin efectos secundarios. Si una columna del row puede ser
 * null, traducimos a `undefined` en TS para mantener firmas opcionales.
 *
 * Reglas:
 * 1. Cada función `rowTo<Type>` recibe la `Row` de la tabla y devuelve el
 *    tipo TS correspondiente.
 * 2. Para INSERT/UPDATE usamos un helper inline en cada repo (selective
 *    mapping) — más legible que un mapper genérico bidireccional.
 * 3. El runtime de Supabase no valida tipos contra el cliente; estos mappers
 *    son la frontera real.
 */

import type { Database } from "@/server/db/database.types";
import type {
  AuditLog,
  Branch,
  Brand,
  Business,
  CashRegisterSession,
  Category,
  Customer,
  CustomerSkinType,
  DefaultBillingType,
  InventoryMovement,
  Laboratory,
  MovementType,
  Payment,
  PaymentMethod,
  Product,
  ProductLot,
  Proforma,
  ProformaStatus,
  SaleItem,
  User,
  UserRole,
  Warehouse,
} from "@/types";

type Tables = Database["public"]["Tables"];

// ─── Tenancy ────────────────────────────────────────────────────────────────

export function businessRowToTs(row: Tables["businesses"]["Row"]): Business {
  return {
    id: row.id,
    legalName: row.legal_name,
    commercialName: row.commercial_name,
    rnc: row.rnc,
    country: row.country,
    phone: row.phone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    instagramUrl: row.instagram_url ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    dgiiEnabled: row.dgii_enabled,
    planId: row.plan_id,
    status: row.status as Business["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function branchRowToTs(row: Tables["branches"]["Row"]): Branch {
  return {
    id: row.id,
    businessId: row.business_id,
    code: row.code,
    name: row.name,
    address: row.address,
    city: row.city,
    province: row.province,
    country: row.country,
    phone: row.phone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    isPilot: row.is_pilot,
    showOnWebsite: row.show_on_website,
    status: row.status as Branch["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function warehouseRowToTs(row: Tables["warehouses"]["Row"]): Warehouse {
  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    code: row.code,
    name: row.name,
    description: row.description ?? undefined,
    isMain: row.is_main,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Users / Audit ──────────────────────────────────────────────────────────

export function userRowToTs(row: Tables["users"]["Row"]): User {
  return {
    id: row.id,
    businessId: row.business_id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone ?? undefined,
    role: row.role as UserRole,
    branchIds: row.branch_ids ?? [],
    twoFactorEnabled: row.two_factor_enabled,
    status: row.status as User["status"],
    lastLoginAt: row.last_login_at ?? undefined,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function auditRowToTs(row: Tables["audit_logs"]["Row"]): AuditLog {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id ?? "",
    userName: row.user_name ?? "",
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    branchId: row.branch_id ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    ipAddress:
      row.ip_address == null ? undefined : String(row.ip_address),
    createdAt: row.created_at,
  };
}

// ─── Catalog ────────────────────────────────────────────────────────────────

export function brandRowToTs(row: Tables["brands"]["Row"]): Brand {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    productCount: row.product_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function categoryRowToTs(
  row: Tables["product_categories"]["Row"],
): Category {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    parentId: row.parent_id ?? null,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function laboratoryRowToTs(
  row: Tables["laboratories"]["Row"],
): Laboratory {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    country: row.country ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function productRowToTs(row: Tables["products"]["Row"]): Product {
  return {
    id: row.id,
    businessId: row.business_id,
    sku: row.sku,
    barcode: row.barcode ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    brandId: row.brand_id ?? undefined,
    laboratoryId: row.laboratory_id ?? undefined,
    categoryId: row.category_id ?? undefined,
    unit: row.unit,
    pharmaceuticalForm:
      (row.pharmaceutical_form as Product["pharmaceuticalForm"]) ?? undefined,
    presentation: row.presentation ?? undefined,
    activeIngredient: row.active_ingredient ?? undefined,
    concentration: row.concentration ?? undefined,
    sanitaryRegistry: row.sanitary_registry ?? undefined,
    storageTemperature: row.storage_temperature ?? undefined,
    requiresPrescription: row.requires_prescription,
    controlled: row.controlled,
    cost: Number(row.cost),
    price: Number(row.price),
    itbisRate: Number(row.itbis_rate),
    minStock: Number(row.min_stock),
    maxStock: Number(row.max_stock),
    imageUrl: row.image_url ?? null,
    active: row.active,
    sellable: row.sellable,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function productLotRowToTs(
  row: Tables["product_lots"]["Row"],
): ProductLot {
  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    warehouseLocationId: row.warehouse_location_id ?? undefined,
    lotNumber: row.lot_number,
    manufacturedAt: row.manufactured_at ?? undefined,
    expiresAt: row.expires_at,
    receivedAt: row.received_at,
    initialQuantity: Number(row.initial_quantity),
    currentQuantity: Number(row.current_quantity),
    unitCost: Number(row.unit_cost),
    unitPrice: row.unit_price == null ? undefined : Number(row.unit_price),
    supplierId: row.supplier_id ?? undefined,
    purchaseInvoice: row.purchase_invoice ?? undefined,
    status: row.status as ProductLot["status"],
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function inventoryMovementRowToTs(
  row: Tables["inventory_movements"]["Row"],
): InventoryMovement {
  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    productId: row.product_id,
    lotId: row.lot_id ?? undefined,
    warehouseId: row.warehouse_id,
    type: row.type as MovementType,
    quantity: Number(row.quantity),
    reason: row.reason ?? undefined,
    reference: row.reference ?? undefined,
    userId: row.user_id ?? "",
    userName: row.user_name ?? "",
    createdAt: row.created_at,
  };
}

// ─── Customers (tabla SQL: clients) ─────────────────────────────────────────

export function clientRowToTs(row: Tables["clients"]["Row"]): Customer {
  type Consent = { templateId: string; grantedAt: string };
  const consents: Consent[] = Array.isArray(row.consents)
    ? (row.consents as unknown as Consent[])
    : [];

  return {
    id: row.id,
    businessId: row.business_id,
    customerNumber: row.customer_number,
    firstName: row.first_name,
    lastName: row.last_name,
    documentType:
      (row.document_type as Customer["documentType"]) ?? undefined,
    documentNumber: row.document_number ?? undefined,
    phone: row.phone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    birthDate: row.birth_date ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    province: row.province ?? undefined,
    source: row.source as Customer["source"],
    tags: row.tags ?? [],
    defaultBillingType: row.default_billing_type as DefaultBillingType,
    skinType: row.skin_type as CustomerSkinType,
    totalSpent: Number(row.total_spent),
    totalOrders: Number(row.total_orders),
    lastVisitAt: row.last_visit_at ?? undefined,
    notes: row.notes ?? undefined,
    consents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

// ─── Sales / POS ────────────────────────────────────────────────────────────

export function proformaItemRowToTs(
  row: Tables["proforma_items"]["Row"],
): SaleItem {
  return {
    productId: row.product_id ?? "",
    productSku: row.product_sku,
    productName: row.product_name,
    lotId: row.product_lot_id ?? undefined,
    lotNumber: row.lot_number ?? undefined,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    itbisRate: Number(row.itbis_rate),
    discount: Number(row.discount),
    subtotal: Number(row.subtotal),
    itbis: Number(row.itbis),
    total: Number(row.total),
  };
}

export function proformaPaymentRowToTs(
  row: Tables["proforma_payments"]["Row"],
): Payment {
  return {
    id: row.id,
    proformaId: row.proforma_id,
    method: row.method_code as PaymentMethod,
    amount: Number(row.amount),
    reference: row.reference ?? undefined,
    userId: row.user_id,
    userName: row.user_name,
    createdAt: row.created_at,
  };
}

export function proformaRowToTs(
  row: Tables["proformas"]["Row"],
  items: SaleItem[] = [],
  payments: Payment[] = [],
): Proforma {
  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    number: row.number,
    customerId: row.customer_id ?? undefined,
    customerName: row.customer_name,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name,
    items,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    itbis: Number(row.itbis),
    total: Number(row.total),
    status: row.status as ProformaStatus,
    payments,
    paid: Number(row.paid),
    balance: Number(row.balance),
    notes: row.notes ?? undefined,
    ecfNumber: row.ecf_number ?? undefined,
    cashRegisterSessionId: row.cash_register_session_id ?? undefined,
    discountPercent:
      row.discount_percent == null ? undefined : Number(row.discount_percent),
    discountAmount:
      row.discount_amount == null ? undefined : Number(row.discount_amount),
    billingType:
      (row.billing_type as DefaultBillingType | null) ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    customerDocument: row.customer_document ?? undefined,
    amountReceived:
      row.amount_received == null ? undefined : Number(row.amount_received),
    changeAmount:
      row.change_amount == null ? undefined : Number(row.change_amount),
    documentKind:
      (row.document_kind as Proforma["documentKind"] | null) ?? undefined,
    ecfType: (row.ecf_type as Proforma["ecfType"] | null) ?? undefined,
    sequenceType:
      (row.sequence_type as Proforma["sequenceType"] | null) ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Cash register ──────────────────────────────────────────────────────────

export function cashSessionRowToTs(
  row: Tables["cash_register_sessions"]["Row"],
  proformaIds: string[] = [],
): CashRegisterSession {
  const defaultTotals: Record<PaymentMethod, number> = {
    cash: 0,
    card: 0,
    transfer: 0,
    azul: 0,
    cardnet: 0,
    visanet: 0,
    paypal: 0,
    manual: 0,
    other: 0,
  };
  const totals =
    row.totals && typeof row.totals === "object" && !Array.isArray(row.totals)
      ? { ...defaultTotals, ...(row.totals as Record<PaymentMethod, number>) }
      : defaultTotals;

  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    sessionNumber: row.session_number,
    cashierId: row.opened_by,
    cashierName: row.opened_by_name,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    openingAmount: Number(row.opening_amount),
    expectedCash: Number(row.expected_cash),
    countedCash: row.counted_cash == null ? undefined : Number(row.counted_cash),
    difference:
      row.difference_amount == null
        ? undefined
        : Number(row.difference_amount),
    totals,
    proformaIds,
    status: row.status as CashRegisterSession["status"],
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
