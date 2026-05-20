import "server-only";
import type {
  ProductLotRepository,
  ProductRepository,
  RepoContext,
} from "../types";
import { SupabaseRepositoryError, getClient } from "./client";
import { productLotRowToTs, productRowToTs } from "./mappers";

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
};
