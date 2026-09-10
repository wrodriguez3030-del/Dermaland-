import "server-only";
import {
  SupabaseRepositoryError,
  UserFacingRepositoryError,
  type AnySupabase,
} from "@/server/repositories/supabase/client";

/**
 * Las 7 tablas con FK a `clients` que "Unificar clientes" reasigna. ÚNICA
 * lista — la usan tanto el dry-run (conteos de lectura) como el guardián de
 * contenido de la migración SQL (`merge-clients-migration.test.ts`): si se
 * agrega una tabla aquí sin tocar el SQL, ese test lo dice.
 */
export const MERGE_IMPACT_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: "alegra_invoices", column: "client_id" },
  { table: "ar_promises", column: "client_id" },
  { table: "client_auth_links", column: "client_id" },
  { table: "electronic_invoices", column: "customer_id" },
  { table: "electronic_invoices_legacy_20260906", column: "customer_id" },
  { table: "proformas", column: "customer_id" },
  { table: "web_orders", column: "client_id" },
];

export interface MergeImpact {
  table: string;
  count: number;
}

/** Cuenta, SIN escribir, cuántas filas de cada tabla se moverían. */
export async function dryRunMergeImpact(
  sb: AnySupabase,
  businessId: string,
  duplicateId: string,
): Promise<MergeImpact[]> {
  const impacts: MergeImpact[] = [];
  for (const { table, column } of MERGE_IMPACT_TABLES) {
    const { count, error } = await sb
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, duplicateId)
      .eq("business_id", businessId);
    if (error) throw new SupabaseRepositoryError(`customer.mergeDryRun:${table}`, error);
    impacts.push({ table, count: count ?? 0 });
  }
  return impacts;
}

export interface MergeClientsResult {
  primaryId: string;
  duplicateId: string;
  moved: MergeImpact[];
}

/** Fusiona `duplicateId` dentro de `primaryId` vía el RPC atómico `merge_clients`. */
export async function mergeClients(
  sb: AnySupabase,
  primaryId: string,
  duplicateId: string,
): Promise<MergeClientsResult> {
  const { data, error } = await sb.rpc("merge_clients", {
    p_primary_id: primaryId,
    p_duplicate_id: duplicateId,
  });
  if (error) {
    if (/no se puede unificar|P0003/i.test(error.message)) {
      throw new UserFacingRepositoryError("No se puede unificar un cliente consigo mismo.");
    }
    if (/no encontrado|P0002/i.test(error.message)) {
      throw new UserFacingRepositoryError(
        "Cliente no encontrado, no pertenece al negocio o ya fue unificado.",
      );
    }
    throw new SupabaseRepositoryError("customer.merge", error);
  }
  const movedRaw = (data?.moved ?? {}) as Record<string, number>;
  const moved: MergeImpact[] = MERGE_IMPACT_TABLES.map(({ table }) => ({
    table,
    count: Number(movedRaw[table] ?? 0),
  }));
  return { primaryId, duplicateId, moved };
}
