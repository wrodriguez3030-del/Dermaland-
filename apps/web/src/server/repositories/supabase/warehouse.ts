import "server-only";
import type { RepoContext, WarehouseRepository } from "../types";
import { SupabaseRepositoryError, getClient } from "./client";
import { warehouseRowToTs } from "./mappers";

export const warehouseRepository: WarehouseRepository = {
  async list(ctx: RepoContext, branchId?: string) {
    const sb = await getClient("warehouse.list");
    let q = sb
      .from("warehouses")
      .select("*")
      .eq("business_id", ctx.businessId);
    if (branchId) q = q.eq("branch_id", branchId);
    q = q.order("name", { ascending: true });
    const { data, error } = await q;
    if (error) throw new SupabaseRepositoryError("warehouse.list", error);
    return (data ?? []).map(warehouseRowToTs);
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("warehouse.byId");
    const { data, error } = await sb
      .from("warehouses")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("warehouse.byId", error);
    return data ? warehouseRowToTs(data) : null;
  },
};
