import type { InventoryCount } from "@/types";
import type { NewInventoryCount, RepoContext } from "../types";
import { SupabaseRepositoryError } from "./client";
import { inventoryCountRowToTs } from "./mappers";

/**
 * Costura mínima del cliente de Supabase que necesita esta operación. Existe
 * para poder probar la compensación sin una base real: el cliente de verdad
 * cumple este contrato de sobra, y el falso de las pruebas solo implementa
 * estos cuatro métodos.
 */
export interface CountWriteClient {
  from(table: string): {
    insert: (rows?: unknown) => {
      select?: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    } & Partial<Promise<{ error: unknown }>>;
    delete?: () => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (column2: string, value2: string) => Promise<{ error: unknown }>;
      };
    };
  };
}

/** Forma estrecha con la que se opera de verdad dentro de la función. */
interface CountWriteOps {
  from: (table: string) => {
    insert: (rows?: unknown) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    } & Promise<{ error: unknown }>;
    delete: () => {
      eq: (
        column: string,
        value: string,
      ) => { eq: (c2: string, v2: string) => Promise<{ error: unknown }> };
    };
  };
}

type CountRow = Parameters<typeof inventoryCountRowToTs>[0];

/**
 * Crea la cabecera del conteo y sus ítems. NO hay transacción en PostgREST, así
 * que si los ítems fallan se borra la cabecera recién creada: es preferible no
 * dejar rastro a dejar una cabecera con `item_count` mintiendo (los 3 conteos
 * del 13-jul eran exactamente eso).
 */
export async function createCountWithItems(
  sb: CountWriteClient,
  ctx: RepoContext,
  input: NewInventoryCount,
  warehouseId: string,
): Promise<InventoryCount> {
  const ops = sb as unknown as CountWriteOps;

  const { data: countRow, error: countErr } = await ops
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

  const cabecera = countRow as CountRow & { id: string };
  if (input.items.length === 0) return inventoryCountRowToTs(cabecera);

  const itemRows = input.items.map((it) => ({
    business_id: ctx.businessId,
    inventory_count_id: cabecera.id,
    product_id: it.productId,
    product_sku: it.productSku,
    product_name: it.productName,
    product_lot_id: it.productLotId ?? null,
    lot_number: it.lotNumber ?? null,
    expires_at: it.expiresAt ?? null,
    warehouse_id: it.warehouseId || warehouseId,
    expected_quantity: it.expectedQuantity,
    counted_quantity: it.countedQuantity,
    // `difference_quantity` es GENERATED ALWAYS (counted - expected): la calcula
    // la base y enviarla lanza "cannot insert a non-DEFAULT value".
    status: it.status,
    last_scan_at: it.lastScanAt ?? null,
  }));

  const { error: itemsErr } = await ops.from("inventory_count_items").insert(itemRows);
  if (itemsErr) {
    // Compensación: sin ítems el conteo no sirve, y una cabecera huérfana
    // envenena los informes. Se borra y se propaga el error real.
    await ops
      .from("inventory_counts")
      .delete()
      .eq("id", cabecera.id)
      .eq("business_id", ctx.businessId);
    throw new SupabaseRepositoryError("inventoryCount.create.items", itemsErr);
  }

  return inventoryCountRowToTs(cabecera);
}
