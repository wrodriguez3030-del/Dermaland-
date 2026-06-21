import "server-only";
import type {
  ProductLotRepository,
  ProductRepository,
  RepoContext,
} from "../types";
import { SupabaseRepositoryError, failRepo, getClient } from "./client";
import { productLotRowToTs, productRowToTs } from "./mappers";
import { ensureDefaultWarehouseForBranch } from "./warehouse";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resuelve el `warehouse_id` REAL de una sucursal en Supabase.
 *
 * El usuario opera por SUCURSAL; el almacén es interno y NUNCA lo configura. La
 * UI calcula un `warehouseId` a partir del seed mock (`defaultWarehouseForBranch`),
 * que en modo Supabase NO existe (las sucursales reales tienen UUID, no el id
 * mock) → devuelve un id sintético `wh_default_…` que NO es un UUID y rompía el
 * INSERT (causa raíz del error `productLot.create`). Por eso aquí ignoramos
 * cualquier id no-UUID y dejamos que el sistema garantice la ubicación interna.
 *
 * - Si el cliente mandó un UUID válido, se respeta (selección explícita).
 * - Si no, se garantiza (creándola si falta) la ubicación interna por defecto
 *   de la sucursal vía `ensureDefaultWarehouseForBranch` — el usuario nunca ve
 *   "la sucursal no tiene un almacén configurado".
 */
export async function resolveBranchWarehouseId(
  sb: Awaited<ReturnType<typeof getClient>>,
  businessId: string,
  branchId: string,
  provided: unknown,
): Promise<string> {
  if (typeof provided === "string" && UUID_RE.test(provided)) return provided;
  return ensureDefaultWarehouseForBranch(sb, businessId, branchId);
}

export const productRepository: ProductRepository = {
  async list(ctx: RepoContext, opts) {
    const sb = await getClient("product.list");
    const activeOnly = opts?.activeOnly ?? true;
    const limit = opts?.limit ?? 50;

    let q = sb
      .from("products")
      .select("*")
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null);

    if (activeOnly) q = q.eq("active", true);
    if (opts?.brandId) q = q.eq("brand_id", opts.brandId);
    if (opts?.categoryId) q = q.eq("category_id", opts.categoryId);

    if (opts?.search) {
      // ILIKE en name/sku/barcode — Supabase usa `or` con string CSV.
      const term = opts.search.replace(/[%,]/g, "");
      q = q.or(
        `name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`,
      );
    }

    q = q.order("name", { ascending: true }).limit(limit);

    const { data, error } = await q;
    if (error) throw new SupabaseRepositoryError("product.list", error);
    return (data ?? []).map(productRowToTs);
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("product.byId");
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("product.byId", error);
    return data ? productRowToTs(data) : null;
  },

  async byBarcode(ctx: RepoContext, barcode: string) {
    const sb = await getClient("product.byBarcode");
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("barcode", barcode)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("product.byBarcode", error);
    return data ? productRowToTs(data) : null;
  },

  async totalStock(ctx: RepoContext, productId: string) {
    const sb = await getClient("product.totalStock");
    const { data, error } = await sb
      .from("product_lots")
      .select("current_quantity")
      .eq("business_id", ctx.businessId)
      .eq("product_id", productId)
      .eq("status", "available");
    if (error) throw new SupabaseRepositoryError("product.totalStock", error);
    return (data ?? []).reduce(
      (acc: number, r: { current_quantity: number | string }) =>
        acc + Number(r.current_quantity ?? 0),
      0,
    );
  },

  async create(ctx: RepoContext, input) {
    const sb = await getClient("product.create");
    const row: Record<string, unknown> = {
      business_id: ctx.businessId,
      sku: input.sku,
      barcode: input.barcode ?? null,
      name: input.name,
      description: input.description ?? null,
      brand_id: input.brandId ?? null,
      laboratory_id: input.laboratoryId ?? null,
      category_id: input.categoryId ?? null,
      unit: input.unit,
      pharmaceutical_form: input.pharmaceuticalForm ?? null,
      presentation: input.presentation ?? null,
      active_ingredient: input.activeIngredient ?? null,
      concentration: input.concentration ?? null,
      sanitary_registry: input.sanitaryRegistry ?? null,
      storage_temperature: input.storageTemperature ?? null,
      requires_prescription: input.requiresPrescription,
      controlled: input.controlled,
      cost: input.cost,
      price: input.price,
      itbis_rate: input.itbisRate,
      min_stock: input.minStock,
      max_stock: input.maxStock,
      image_url: input.imageUrl ?? null,
      active: input.active,
      sellable: input.sellable,
    };
    const { data, error } = await sb.from("products").insert(row).select("*").single();
    if (error) throw failRepo("product.create", error);
    return productRowToTs(data);
  },

  async update(ctx: RepoContext, id: string, patch) {
    const sb = await getClient("product.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.sku !== undefined) row.sku = patch.sku;
    if (patch.barcode !== undefined) row.barcode = patch.barcode ?? null;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description ?? null;
    if (patch.brandId !== undefined) row.brand_id = patch.brandId ?? null;
    if (patch.laboratoryId !== undefined) row.laboratory_id = patch.laboratoryId ?? null;
    if (patch.categoryId !== undefined) row.category_id = patch.categoryId ?? null;
    if (patch.unit !== undefined) row.unit = patch.unit;
    if (patch.pharmaceuticalForm !== undefined) row.pharmaceutical_form = patch.pharmaceuticalForm ?? null;
    if (patch.presentation !== undefined) row.presentation = patch.presentation ?? null;
    if (patch.activeIngredient !== undefined) row.active_ingredient = patch.activeIngredient ?? null;
    if (patch.concentration !== undefined) row.concentration = patch.concentration ?? null;
    if (patch.sanitaryRegistry !== undefined) row.sanitary_registry = patch.sanitaryRegistry ?? null;
    if (patch.storageTemperature !== undefined) row.storage_temperature = patch.storageTemperature ?? null;
    if (patch.requiresPrescription !== undefined) row.requires_prescription = patch.requiresPrescription;
    if (patch.controlled !== undefined) row.controlled = patch.controlled;
    if (patch.cost !== undefined) row.cost = patch.cost;
    if (patch.price !== undefined) row.price = patch.price;
    if (patch.itbisRate !== undefined) row.itbis_rate = patch.itbisRate;
    if (patch.minStock !== undefined) row.min_stock = patch.minStock;
    if (patch.maxStock !== undefined) row.max_stock = patch.maxStock;
    if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl ?? null;
    if (patch.active !== undefined) row.active = patch.active;
    if (patch.sellable !== undefined) row.sellable = patch.sellable;
    const { data, error } = await sb
      .from("products")
      .update(row)
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw failRepo("product.update", error);
    return productRowToTs(data);
  },

  async softDelete(ctx: RepoContext, id: string) {
    const sb = await getClient("product.softDelete");
    const { error } = await sb
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", id);
    if (error) throw new SupabaseRepositoryError("product.softDelete", error);
  },
};

export const productLotRepository: ProductLotRepository = {
  async list(ctx: RepoContext, opts) {
    const sb = await getClient("productLot.list");
    let q = sb
      .from("product_lots")
      .select("*")
      .eq("business_id", ctx.businessId);

    if (opts?.productId) q = q.eq("product_id", opts.productId);
    if (opts?.status) q = q.eq("status", opts.status);

    if (opts?.expiringWithinDays != null) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + opts.expiringWithinDays);
      const today = new Date();
      q = q
        .gte("expires_at", today.toISOString().slice(0, 10))
        .lte("expires_at", cutoff.toISOString().slice(0, 10));
    }

    q = q.order("expires_at", { ascending: true });
    const { data, error } = await q;
    if (error) throw new SupabaseRepositoryError("productLot.list", error);
    return (data ?? []).map(productLotRowToTs);
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("productLot.byId");
    const { data, error } = await sb
      .from("product_lots")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("productLot.byId", error);
    return data ? productLotRowToTs(data) : null;
  },

  async selectFefo(ctx: RepoContext, productId: string) {
    const sb = await getClient("productLot.selectFefo");
    // RPC `select_lot_for_sale(p_business_id, p_product_id, p_branch_id?)`
    // devuelve el ID del lote FEFO disponible o null.
    const { data: lotId, error } = await sb.rpc("select_lot_for_sale", {
      p_business_id: ctx.businessId,
      p_product_id: productId,
      p_branch_id: ctx.branchId ?? null,
    });
    if (error) throw new SupabaseRepositoryError("productLot.selectFefo", error);
    if (!lotId) return null;
    const { data, error: e2 } = await sb
      .from("product_lots")
      .select("*")
      .eq("id", lotId as string)
      .eq("business_id", ctx.businessId)
      .maybeSingle();
    if (e2) throw new SupabaseRepositoryError("productLot.selectFefo:fetch", e2);
    return data ? productLotRowToTs(data) : null;
  },

  async quarantine(ctx: RepoContext, lotId: string, reason: string) {
    const sb = await getClient("productLot.quarantine");
    const { error: updError } = await sb
      .from("product_lots")
      .update({ status: "quarantine", updated_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", lotId);
    if (updError)
      throw new SupabaseRepositoryError("productLot.quarantine:update", updError);

    const { error: insError } = await sb.from("lot_quarantine").insert({
      business_id: ctx.businessId,
      product_lot_id: lotId,
      reason,
      user_id: ctx.userId ?? null,
    });
    if (insError)
      throw new SupabaseRepositoryError(
        "productLot.quarantine:insert",
        insError,
      );
  },

  async release(ctx: RepoContext, lotId: string) {
    const sb = await getClient("productLot.release");
    const { error: updError } = await sb
      .from("product_lots")
      .update({ status: "available", updated_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", lotId);
    if (updError)
      throw new SupabaseRepositoryError("productLot.release:update", updError);

    // Marca la cuarentena vigente como liberada.
    const { error: qError } = await sb
      .from("lot_quarantine")
      .update({
        released_at: new Date().toISOString(),
        released_by: ctx.userId ?? null,
      })
      .eq("business_id", ctx.businessId)
      .eq("product_lot_id", lotId)
      .is("released_at", null);
    if (qError)
      throw new SupabaseRepositoryError("productLot.release:quarantine", qError);
  },

  async recall(ctx: RepoContext, lotId: string, reason: string) {
    const sb = await getClient("productLot.recall");
    const { error: updError } = await sb
      .from("product_lots")
      .update({ status: "recalled", updated_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", lotId);
    if (updError)
      throw new SupabaseRepositoryError("productLot.recall:update", updError);

    const { error: insError } = await sb.from("lot_recalls").insert({
      business_id: ctx.businessId,
      product_lot_id: lotId,
      reason,
      initiated_by: ctx.userId ?? null,
    });
    if (insError)
      throw new SupabaseRepositoryError("productLot.recall:insert", insError);
  },

  async create(ctx: RepoContext, input) {
    const sb = await getClient("productLot.create");
    // Resolver el almacén REAL de la sucursal (no confiar en el id mock que
    // manda la UI). Esto es la corrección de raíz del error productLot.create.
    const warehouseId = await resolveBranchWarehouseId(
      sb,
      ctx.businessId,
      input.branchId,
      input.warehouseId,
    );
    const row: Record<string, unknown> = {
      business_id: ctx.businessId,
      branch_id: input.branchId,
      product_id: input.productId,
      warehouse_id: warehouseId,
      warehouse_location_id: input.warehouseLocationId ?? null,
      lot_number: input.lotNumber,
      manufactured_at: input.manufacturedAt ?? null,
      expires_at: input.expiresAt,
      received_at: input.receivedAt,
      initial_quantity: input.initialQuantity,
      current_quantity: input.currentQuantity,
      unit_cost: input.unitCost,
      unit_price: input.unitPrice ?? null,
      supplier_id: input.supplierId ?? null,
      purchase_invoice: input.purchaseInvoice ?? null,
      status: input.status ?? "available",
      notes: input.notes ?? null,
    };
    const { data, error } = await sb
      .from("product_lots")
      .insert(row)
      .select("*")
      .single();
    if (error) failRepo("productLot.create", error);
    return productLotRowToTs(data);
  },

  async adjustQuantity(ctx: RepoContext, lotId: string, newQuantity: number) {
    const sb = await getClient("productLot.adjustQuantity");
    const { data, error } = await sb
      .from("product_lots")
      .update({
        current_quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", ctx.businessId)
      .eq("id", lotId)
      .select("*")
      .single();
    if (error) failRepo("productLot.adjustQuantity", error);
    return productLotRowToTs(data);
  },
};
