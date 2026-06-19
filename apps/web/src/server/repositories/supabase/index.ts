/**
 * Adaptadores Supabase del agregado `Repositories`.
 *
 * Activos cuando `DATA_SOURCE=supabase` y las env vars
 * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` están
 * presentes. Los módulos individuales (./business, ./branch, etc.) usan
 * `createServer()` lazily — si no hay env vars, lanzan un error claro
 * desde `client.getClient()`.
 *
 * **Reglas de oro:**
 *
 * 1. SIEMPRE filtrar por `business_id = ctx.businessId` aunque RLS lo haga —
 *    defensa en profundidad (R-SEC-01).
 * 2. NUNCA usar `createServiceRoleClient()` directamente desde aquí —
 *    bypassea RLS. La única excepción es `audit.log` que necesita escribir
 *    incluso si RLS bloquea al usuario (auditoría inmutable).
 * 3. Mapeo snake_case ↔ camelCase en `./mappers.ts`.
 * 4. Los módulos que aún no se necesitan (recommendation, dermatologyRef,
 *    subscription, plan, whatsapp, ai, apiV3, inventoryCount) siguen como
 *    `stub()` — la idea es implementar a medida que cada módulo entre en
 *    producción real.
 */

import type { Repositories } from "../types";
import { auditRepository } from "./audit";
import { branchRepository } from "./branch";
import { businessRepository } from "./business";
import {
  brandRepository,
  categoryRepository,
  laboratoryRepository,
} from "./catalog";
import { customerRepository } from "./customer";
import { dgiiRepository } from "./dgii";
import { inventoryMovementRepository } from "./inventory";
import { productLotRepository, productRepository } from "./product";
import {
  cashRegisterRepository,
  proformaRepository,
} from "./sales";
import { userRepository } from "./user";
import { warehouseRepository } from "./warehouse";
import { supplierInvoiceRepository, expenseRepository, recurringExpenseRepository, supplierRepository, expenseCategoryRepository } from "./purchases";

class NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `Repositorio Supabase: ${method}() no implementado. ` +
        `Activa DATA_SOURCE=mock en .env mientras tanto, o implementa la query.`,
    );
    this.name = "NotImplementedError";
  }
}

const stub = (name: string) => () => Promise.reject(new NotImplementedError(name));

export const supabaseRepositories: Repositories = {
  business: businessRepository,
  branch: branchRepository,
  warehouse: warehouseRepository,
  user: userRepository,
  audit: auditRepository,
  brand: brandRepository,
  category: categoryRepository,
  laboratory: laboratoryRepository,
  product: productRepository,
  productLot: productLotRepository,
  inventoryMovement: inventoryMovementRepository,
  // El conteo físico de inventario (Phase 2.1) tiene flujo offline-first
  // complejo (scans con dedupe por device_id + offline_scan_id, items
  // calculados, transiciones de estado). Pendiente de implementación en
  // Supabase — sigue como stub hasta que el módulo de conteo entre en
  // producción real.
  inventoryCount: {
    list: stub("inventoryCount.list"),
    byId: stub("inventoryCount.byId"),
    scans: stub("inventoryCount.scans"),
    items: stub("inventoryCount.items"),
    recordScan: stub("inventoryCount.recordScan"),
    submit: stub("inventoryCount.submit"),
    approve: stub("inventoryCount.approve"),
    reject: stub("inventoryCount.reject"),
  },
  customer: customerRepository,
  proforma: proformaRepository,
  cashRegister: cashRegisterRepository,
  // Recommendations (Phase 5) — pendiente hasta que el módulo dermatológico
  // entre en producción.
  recommendation: {
    list: stub("recommendation.list"),
    byId: stub("recommendation.byId"),
    create: stub("recommendation.create"),
  },
  dermatologyRef: {
    skinTypes: stub("dermatologyRef.skinTypes"),
    conditions: stub("dermatologyRef.conditions"),
    routineTemplates: stub("dermatologyRef.routineTemplates"),
  },
  // SaaS / Platform (Phase 7) — para super-admin.
  subscription: {
    current: stub("subscription.current"),
    usage: stub("subscription.usage"),
  },
  plan: { list: stub("plan.list") },
  // Integraciones (Phase 8) — WhatsApp/IA/API V3.
  whatsapp: {
    templates: stub("whatsapp.templates"),
    conversations: stub("whatsapp.conversations"),
    messages: stub("whatsapp.messages"),
  },
  ai: { agents: stub("ai.agents"), logs: stub("ai.logs") },
  apiV3: { keys: stub("apiV3.keys"), webhooks: stub("apiV3.webhooks") },
  // El módulo DGII tiene implementación real Supabase en `./dgii.ts`.
  dgii: dgiiRepository,
  supplierInvoice: supplierInvoiceRepository,
  expense: expenseRepository,
  recurringExpense: recurringExpenseRepository,
  supplier: supplierRepository,
  expenseCategory: expenseCategoryRepository,
};
