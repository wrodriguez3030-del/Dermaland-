import "server-only";
import type { RepoContext, WarehouseRepository } from "../types";
import {
  type AnySupabase,
  SupabaseRepositoryError,
  failRepo,
  getClient,
  pgErrorCode,
} from "./client";
import { warehouseRowToTs } from "./mappers";

/**
 * Nombre interno del almacén por defecto de una sucursal. El inventario es por
 * SUCURSAL; el almacén es un detalle interno y NO se muestra al usuario. Si
 * algún día se expone, este nombre genérico evita códigos crípticos tipo
 * "NACO-MAIN" / "STG-MAIN".
 */
const INTERNAL_DEFAULT_WAREHOUSE_NAME = "Inventario";

/**
 * Garantiza que una sucursal tenga su almacén/ubicación interna por defecto y
 * devuelve su `id`. El usuario NUNCA configura almacenes: el inventario es por
 * sucursal y el sistema crea la ubicación interna automáticamente.
 *
 * Idempotente y seguro ante concurrencia:
 *  1. Si la sucursal ya tiene un almacén (preferimos el `is_main`), lo devuelve.
 *  2. Si no, inserta uno con un `code` determinista (`auto-<branchId>`),
 *     `is_main = true`, asociado al `business_id` y `branch_id` correctos.
 *  3. Si dos requests compiten y chocan en `unique(business_id, code)` (23505),
 *     re-consulta por ese `code` y devuelve el que ganó la carrera.
 *
 * No borra ni duplica nada. Las sucursales con almacén previo (aunque tenga
 * otro `code`) se respetan tal cual: solo se crea cuando no existe ninguno.
 */
export async function ensureDefaultWarehouseForBranch(
  sb: AnySupabase,
  businessId: string,
  branchId: string,
): Promise<string> {
  // 1. ¿Ya existe un almacén para esta sucursal?
  const { data: existing, error: selError } = await sb
    .from("warehouses")
    .select("id, is_main")
    .eq("business_id", businessId)
    .eq("branch_id", branchId)
    .order("is_main", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selError) failRepo("warehouse.ensureDefault:select", selError);
  if (existing) return existing.id as string;

  // 2. No existe → crear la ubicación interna por defecto.
  const code = `auto-${branchId}`;
  const { data: created, error: insError } = await sb
    .from("warehouses")
    .insert({
      business_id: businessId,
      branch_id: branchId,
      code,
      name: INTERNAL_DEFAULT_WAREHOUSE_NAME,
      is_main: true,
    })
    .select("id")
    .single();
  if (!insError) return created.id as string;

  // 3. Carrera: otro request creó el almacén primero (mismo business_id+code).
  if (pgErrorCode(insError) === "23505") {
    const { data: again, error: againError } = await sb
      .from("warehouses")
      .select("id")
      .eq("business_id", businessId)
      .eq("code", code)
      .maybeSingle();
    if (againError) failRepo("warehouse.ensureDefault:reselect", againError);
    if (again) return again.id as string;
  }
  failRepo("warehouse.ensureDefault:insert", insError);
}

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
