import type { NewInventoryCount } from "../types";
import type { InventoryCountStatus } from "@/types";
import { SupabaseRepositoryError } from "./client";

/** Ítems y estado final con los que se cierra un conteo ya existente. */
export interface CountConsolidateInput {
  items: NewInventoryCount["items"];
  status: InventoryCountStatus;
}

/** Costura mínima del cliente que necesita esta operación (ver create). */
export interface CountConsolidateClient {
  from(table: string): unknown;
}

interface ConsolidateOps {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (
          c2: string,
          v2: string,
        ) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
    insert: (rows: unknown) => Promise<{ error: unknown }>;
    delete: () => {
      eq: (
        c: string,
        v: string,
      ) => { eq: (c2: string, v2: string) => Promise<{ error: unknown }> };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (
          c2: string,
          v2: string,
        ) => {
          select: (columns: string) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
  };
}

/**
 * Cierra un conteo que ya existe en la nube: reemplaza sus ítems y fija su
 * estado final. Es la contraparte de `createCountWithItems` para el flujo en el
 * que la cabecera nació al empezar a escanear — así un conteo es SIEMPRE una
 * sola fila, en vez de una provisional vacía más otra aprobada.
 *
 * Los ítems se reemplazan (borrar + insertar) en vez de acumularse: el conteo
 * local es la verdad al aprobar, y reintentar la consolidación debe dar el
 * mismo resultado.
 */
export async function consolidateCountItems(
  sb: CountConsolidateClient,
  ctx: { businessId: string },
  countId: string,
  input: CountConsolidateInput,
): Promise<void> {
  const ops = sb as unknown as ConsolidateOps;

  // La cabecera manda el almacén, y de paso confirma que el conteo es de este
  // negocio (defensa en profundidad además de RLS).
  const { data: cabecera, error: cabErr } = await ops
    .from("inventory_counts")
    .select("id, warehouse_id")
    .eq("id", countId)
    .eq("business_id", ctx.businessId)
    .maybeSingle();
  if (cabErr)
    throw new SupabaseRepositoryError("inventoryCount.consolidate.byId", cabErr);
  if (!cabecera)
    throw new SupabaseRepositoryError(
      "inventoryCount.consolidate",
      "El conteo no existe o pertenece a otro negocio.",
    );
  const warehouseId = (cabecera as { warehouse_id: string }).warehouse_id;

  const { error: delErr } = await ops
    .from("inventory_count_items")
    .delete()
    .eq("inventory_count_id", countId)
    .eq("business_id", ctx.businessId);
  if (delErr)
    throw new SupabaseRepositoryError("inventoryCount.consolidate.clear", delErr);

  if (input.items.length > 0) {
    const filas = input.items.map((it) => ({
      business_id: ctx.businessId,
      inventory_count_id: countId,
      product_id: it.productId,
      product_sku: it.productSku,
      product_name: it.productName,
      product_lot_id: it.productLotId ?? null,
      lot_number: it.lotNumber ?? null,
      expires_at: it.expiresAt ?? null,
      warehouse_id: it.warehouseId || warehouseId,
      expected_quantity: it.expectedQuantity,
      counted_quantity: it.countedQuantity,
      // `difference_quantity` es GENERATED ALWAYS: la calcula la base.
      status: it.status,
      last_scan_at: it.lastScanAt ?? null,
    }));
    const { error: insErr } = await ops
      .from("inventory_count_items")
      .insert(filas);
    if (insErr)
      throw new SupabaseRepositoryError("inventoryCount.consolidate.items", insErr);
  }

  const ahora = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    item_count: input.items.length,
    updated_at: ahora,
  };
  if (input.status === "approved" || input.status === "adjusted")
    patch.approved_at = ahora;

  const { data: filas, error: updErr } = await ops
    .from("inventory_counts")
    .update(patch)
    .eq("id", countId)
    .eq("business_id", ctx.businessId)
    .select("id");
  if (updErr)
    throw new SupabaseRepositoryError("inventoryCount.consolidate.status", updErr);
  // Un UPDATE de 0 filas NO es éxito.
  if (!filas || filas.length === 0)
    throw new SupabaseRepositoryError(
      "inventoryCount.consolidate.status",
      "El conteo no se pudo actualizar.",
    );
}
