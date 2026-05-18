/**
 * Adaptadores Supabase — esqueleto.
 *
 * Cada método actualmente lanza `NotImplementedError` para forzar fallar
 * temprano si alguien activa `DATA_SOURCE=supabase` antes de implementar
 * la query real. La implementación real va a:
 *
 *   const sb = await createServer();
 *   const { data, error } = await sb
 *     .from("products")
 *     .select("*")
 *     .eq("business_id", ctx.businessId);
 *   if (error) throw error;
 *   return data.map(rowToProduct);
 *
 * **Reglas de oro:**
 *
 * 1. SIEMPRE filtrar por `business_id = ctx.businessId` aunque RLS lo haga —
 *    defensa en profundidad.
 * 2. NUNCA usar `createServiceRoleClient()` aquí — bypassea RLS. Solo en
 *    server actions/admin con auditoría explícita.
 * 3. Mapear snake_case ↔ camelCase en la frontera (helpers en `mappers.ts`
 *    cuando crezca).
 */

import type { Repositories } from "../types";
import { dgiiRepository } from "./dgii";

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
  business: {
    current: stub("business.current"),
    update: stub("business.update"),
  },
  branch: {
    list: stub("branch.list"),
    byId: stub("branch.byId"),
    create: stub("branch.create"),
  },
  warehouse: {
    list: stub("warehouse.list"),
    byId: stub("warehouse.byId"),
  },
  user: {
    list: stub("user.list"),
    byId: stub("user.byId"),
    current: stub("user.current"),
  },
  audit: {
    list: stub("audit.list"),
    log: stub("audit.log"),
  },
  brand: { list: stub("brand.list"), byId: stub("brand.byId") },
  category: { list: stub("category.list") },
  laboratory: { list: stub("laboratory.list") },
  product: {
    list: stub("product.list"),
    byId: stub("product.byId"),
    byBarcode: stub("product.byBarcode"),
    totalStock: stub("product.totalStock"),
  },
  productLot: {
    list: stub("productLot.list"),
    byId: stub("productLot.byId"),
    selectFefo: stub("productLot.selectFefo"),
    quarantine: stub("productLot.quarantine"),
    release: stub("productLot.release"),
    recall: stub("productLot.recall"),
  },
  inventoryMovement: {
    list: stub("inventoryMovement.list"),
    create: stub("inventoryMovement.create"),
  },
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
  customer: {
    list: stub("customer.list"),
    byId: stub("customer.byId"),
    notes: stub("customer.notes"),
    create: stub("customer.create"),
  },
  proforma: {
    list: stub("proforma.list"),
    byId: stub("proforma.byId"),
    create: stub("proforma.create"),
    cancel: stub("proforma.cancel"),
    convertToEcf: stub("proforma.convertToEcf"),
  },
  cashRegister: {
    current: stub("cashRegister.current"),
    history: stub("cashRegister.history"),
    open: stub("cashRegister.open"),
    close: stub("cashRegister.close"),
  },
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
  subscription: {
    current: stub("subscription.current"),
    usage: stub("subscription.usage"),
  },
  plan: { list: stub("plan.list") },
  whatsapp: {
    templates: stub("whatsapp.templates"),
    conversations: stub("whatsapp.conversations"),
    messages: stub("whatsapp.messages"),
  },
  ai: { agents: stub("ai.agents"), logs: stub("ai.logs") },
  apiV3: { keys: stub("apiV3.keys"), webhooks: stub("apiV3.webhooks") },
  // El módulo DGII tiene implementación real Supabase en `./dgii.ts` (lazy
  // client). Las demás secciones siguen como stub hasta que se necesiten
  // en producción real.
  dgii: dgiiRepository,
};
