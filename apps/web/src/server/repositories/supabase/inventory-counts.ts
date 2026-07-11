import "server-only";
import type { InventoryCountRepository, RepoContext } from "../types";
import { SupabaseRepositoryError, getClient } from "./client";
import {
  inventoryCountRowToTs,
  inventoryCountItemRowToTs,
  inventoryCountScanRowToTs,
} from "./mappers";

/**
 * Repositorio Supabase del Inventario físico (conteo físico) — FASE 1: LECTURA.
 *
 * Implementa `list`/`byId`/`items`/`scans` sobre las tablas `inventory_counts`,
 * `inventory_count_items`, `inventory_count_scans`. Defensa en profundidad:
 * SIEMPRE filtra por `business_id = ctx.businessId` aunque RLS ya lo aplique
 * (R-SEC-01). Las escrituras (recordScan/submit/approve/reject) llegan en la
 * Fase 3; por ahora rechazan con un mensaje claro.
 */
const pendingWrite = (method: string) =>
  Promise.reject(
    new Error(
      `inventoryCount.${method}(): escritura pendiente (Fase 3 de la migración del conteo físico).`,
    ),
  );

export const inventoryCountRepository: InventoryCountRepository = {
  async list(ctx: RepoContext) {
    const sb = await getClient("inventoryCount.list");
    const { data, error } = await sb
      .from("inventory_counts")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: false });
    if (error) throw new SupabaseRepositoryError("inventoryCount.list", error);
    return (data ?? []).map(inventoryCountRowToTs);
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("inventoryCount.byId");
    const { data, error } = await sb
      .from("inventory_counts")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("inventoryCount.byId", error);
    return data ? inventoryCountRowToTs(data) : null;
  },

  async items(ctx: RepoContext, countId: string) {
    const sb = await getClient("inventoryCount.items");
    const { data, error } = await sb
      .from("inventory_count_items")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("inventory_count_id", countId)
      .order("created_at", { ascending: true });
    if (error) throw new SupabaseRepositoryError("inventoryCount.items", error);
    return (data ?? []).map(inventoryCountItemRowToTs);
  },

  async scans(ctx: RepoContext, countId: string) {
    const sb = await getClient("inventoryCount.scans");
    const { data, error } = await sb
      .from("inventory_count_scans")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("inventory_count_id", countId)
      .order("scanned_at", { ascending: true });
    if (error) throw new SupabaseRepositoryError("inventoryCount.scans", error);
    return (data ?? []).map(inventoryCountScanRowToTs);
  },

  // ── Escrituras (Fase 3) ──
  recordScan: () => pendingWrite("recordScan"),
  submit: () => pendingWrite("submit"),
  approve: () => pendingWrite("approve"),
  reject: () => pendingWrite("reject"),
};
