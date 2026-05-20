import "server-only";
import type {
  InventoryMovementRepository,
  RepoContext,
} from "../types";
import type { InventoryMovement } from "@/types";
import { SupabaseRepositoryError, getClient } from "./client";
import { inventoryMovementRowToTs } from "./mappers";

export const inventoryMovementRepository: InventoryMovementRepository = {
  async list(ctx: RepoContext, opts) {
    const sb = await getClient("inventoryMovement.list");
    let q = sb
      .from("inventory_movements")
      .select("*")
      .eq("business_id", ctx.businessId);
    if (opts?.productId) q = q.eq("product_id", opts.productId);
    if (opts?.lotId) q = q.eq("lot_id", opts.lotId);
    q = q
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? 200);
    const { data, error } = await q;
    if (error)
      throw new SupabaseRepositoryError("inventoryMovement.list", error);
    return (data ?? []).map(inventoryMovementRowToTs);
  },

  async create(
    ctx: RepoContext,
    movement: Omit<InventoryMovement, "id" | "createdAt">,
  ) {
    const sb = await getClient("inventoryMovement.create");
    const row = {
      business_id: ctx.businessId,
      branch_id: movement.branchId,
      product_id: movement.productId,
      lot_id: movement.lotId ?? null,
      warehouse_id: movement.warehouseId,
      type: movement.type,
      quantity: movement.quantity,
      reason: movement.reason ?? null,
      reference: movement.reference ?? null,
      user_id: movement.userId || null,
      user_name: movement.userName || null,
    };
    const { data, error } = await sb
      .from("inventory_movements")
      .insert(row)
      .select("*")
      .single();
    if (error)
      throw new SupabaseRepositoryError("inventoryMovement.create", error);
    return inventoryMovementRowToTs(data);
  },
};
