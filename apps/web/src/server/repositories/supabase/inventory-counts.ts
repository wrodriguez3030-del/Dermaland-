import "server-only";
import type {
  InventoryCountRepository,
  NewInventoryCount,
  RepoContext,
} from "../types";
import type { InventoryCountScan } from "@/types";
import { SupabaseRepositoryError, getClient } from "./client";
import {
  inventoryCountRowToTs,
  inventoryCountItemRowToTs,
  inventoryCountScanRowToTs,
} from "./mappers";

/**
 * Repositorio Supabase del Inventario físico (conteo físico).
 *
 * LECTURA (Fase 1): list/byId/items/scans.
 * ESCRITURA (Fase 3): create (cabecera + ítems), recordScan (idempotente),
 * submit/approve/reject (transiciones de estado). NO muta stock ni genera
 * `inventory_movements` — el ajuste de existencias es un paso aparte (Fase 3b).
 *
 * Defensa en profundidad: SIEMPRE `business_id = ctx.businessId` (además de RLS).
 * Las escrituras verifican filas afectadas: un UPDATE de 0 filas NO es éxito.
 */

/** Resuelve el almacén de la sucursal cuando el input no lo trae. */
async function resolveWarehouseId(
  sb: Awaited<ReturnType<typeof getClient>>,
  businessId: string,
  branchId: string,
  preferred?: string,
): Promise<string> {
  if (preferred) return preferred;
  const { data, error } = await sb
    .from("warehouses")
    .select("id")
    .eq("business_id", businessId)
    .eq("branch_id", branchId)
    .limit(1)
    .maybeSingle();
  if (error) throw new SupabaseRepositoryError("inventoryCount.resolveWarehouse", error);
  if (!data?.id) {
    throw new Error(
      "La sucursal no tiene un almacén configurado; no se puede crear el conteo.",
    );
  }
  return data.id;
}

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

  async create(ctx: RepoContext, input: NewInventoryCount) {
    const sb = await getClient("inventoryCount.create");
    const warehouseId = await resolveWarehouseId(
      sb,
      ctx.businessId,
      input.branchId,
      input.warehouseId,
    );

    const { data: countRow, error: countErr } = await sb
      .from("inventory_counts")
      .insert({
        business_id: ctx.businessId,
        branch_id: input.branchId,
        warehouse_id: warehouseId,
        count_number: input.countNumber,
        count_type: input.countType,
        status: input.status ?? "in_progress",
        assigned_to: input.assignedTo ?? [],
        started_at: input.startedAt ?? new Date().toISOString(),
        notes: input.notes ?? null,
        scan_count: 0,
        item_count: input.items.length,
      })
      .select("*")
      .single();
    if (countErr) throw new SupabaseRepositoryError("inventoryCount.create", countErr);

    if (input.items.length > 0) {
      const itemRows = input.items.map((it) => {
        return {
          business_id: ctx.businessId,
          inventory_count_id: countRow.id,
          product_id: it.productId,
          product_sku: it.productSku,
          product_name: it.productName,
          product_lot_id: it.productLotId ?? null,
          lot_number: it.lotNumber ?? null,
          expires_at: it.expiresAt ?? null,
          warehouse_id: it.warehouseId || warehouseId,
          expected_quantity: it.expectedQuantity,
          counted_quantity: it.countedQuantity,
          // `difference_quantity` es GENERATED ALWAYS (counted - expected) en la BD:
          // NO se puede insertar (lanza "cannot insert a non-DEFAULT value"). La BD
          // la calcula sola. (Bug latente: las tablas estaban vacías, nunca se ejecutó.)
          status: it.status,
          last_scan_at: it.lastScanAt ?? null,
        };
      });
      const { error: itemsErr } = await sb
        .from("inventory_count_items")
        .insert(itemRows);
      if (itemsErr)
        throw new SupabaseRepositoryError("inventoryCount.create.items", itemsErr);
    }

    return inventoryCountRowToTs(countRow);
  },

  async recordScan(ctx: RepoContext, scan: Omit<InventoryCountScan, "id">) {
    const sb = await getClient("inventoryCount.recordScan");
    // Idempotente por el índice único (device_id, offline_scan_id): si el scan
    // ya existe, `ignoreDuplicates` lo omite y el select no devuelve fila.
    const { data, error } = await sb
      .from("inventory_count_scans")
      .upsert(
        {
          business_id: ctx.businessId,
          inventory_count_id: scan.inventoryCountId,
          product_id: scan.productId,
          product_lot_id: scan.productLotId ?? null,
          branch_id: scan.branchId,
          warehouse_id: scan.warehouseId,
          warehouse_location_id: scan.warehouseLocationId ?? null,
          barcode: scan.barcode ?? null,
          scanned_quantity: scan.scannedQuantity,
          scan_source: scan.scanSource,
          scanned_by: scan.scannedBy || null,
          scanned_by_name: scan.scannedByName || null,
          scanned_at: scan.scannedAt,
          device_id: scan.deviceId,
          offline_scan_id: scan.offlineScanId,
          sync_status: scan.syncStatus,
          notes: scan.notes ?? null,
        },
        { onConflict: "device_id,offline_scan_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new SupabaseRepositoryError("inventoryCount.recordScan", error);
    return { inserted: (data?.length ?? 0) > 0 };
  },

  async submit(ctx: RepoContext, countId: string) {
    await transition(ctx, countId, {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    }, "submit");
  },

  async approve(ctx: RepoContext, countId: string) {
    // B-05b (Fase 3b): aprobar AJUSTA el stock real de los lotes según las
    // diferencias del conteo, atómico e idempotente (RPC `apply_count_adjustments`,
    // mig 0030). Aplica el delta (respeta ventas intermedias), registra
    // `count_adjustment` y nunca deja stock negativo. Antes solo cambiaba el estado.
    const sb = await getClient("inventoryCount.approve");
    const { error } = await sb.rpc("apply_count_adjustments", { p_count_id: countId });
    if (error) {
      if (/no encontrado|P0002/i.test(error.message)) {
        throw new Error("Conteo no encontrado o sin permiso (approve).");
      }
      throw new SupabaseRepositoryError("inventoryCount.approve", error);
    }
  },

  async reject(ctx: RepoContext, countId: string, reason: string) {
    await transition(ctx, countId, {
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: ctx.userId ?? null,
      notes: reason,
    }, "reject");
  },
};

/** UPDATE de estado con guarda por business_id y verificación de filas. */
async function transition(
  ctx: RepoContext,
  countId: string,
  patch: Record<string, unknown>,
  label: string,
): Promise<void> {
  const sb = await getClient(`inventoryCount.${label}`);
  const { data, error } = await sb
    .from("inventory_counts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.businessId)
    .eq("id", countId)
    .select("id");
  if (error) throw new SupabaseRepositoryError(`inventoryCount.${label}`, error);
  if (!data || data.length === 0) {
    throw new Error(`Conteo no encontrado o sin permiso (${label}).`);
  }
}
