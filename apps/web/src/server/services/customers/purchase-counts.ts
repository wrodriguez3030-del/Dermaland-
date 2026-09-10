import "server-only";
import { SupabaseRepositoryError, type AnySupabase } from "@/server/repositories/supabase/client";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";

/**
 * Compras REALES por cliente (POS + Alegra), vía el RPC `client_purchase_counts`
 * (mig `20260910130000`). `clients.total_orders` NO sirve para esto: solo
 * cuenta ventas del POS propio y queda en 0 para casi todos los clientes
 * migrados de Alegra — el mismo silencio que `resumen_ventas_unificadas` ya
 * cerró para el panel y los reportes.
 *
 * 🔴 Reproducido en vivo el 10/09/2026: sin `.range()`, PostgREST cortaba la
 * respuesta en las primeras 1000 filas EN SILENCIO (mismo tope que
 * `dermaland-postgrest-1000-cap` ya documentó en otras rutas). Con ~6500
 * clientes reales con compras, "Unificar clientes" mostraba «0 compras» para
 * la inmensa mayoría — sin un solo error, porque `sb.rpc()` sin `.range()`
 * "funciona" perfecto hasta que hay más de 1000 filas. `fetchAllPages` es el
 * MISMO helper que ya usa `customer.list`/`/api/incentives` para esto.
 *
 * `sb` tipado `AnySupabase` a propósito: `client_purchase_counts` es una
 * función nueva que `database.types.ts` (generado) todavía no conoce —
 * mismo patrón que `mergeClients`/`dryRunMergeImpact` en este mismo módulo.
 */
export async function getClientPurchaseCounts(sb: AnySupabase): Promise<Map<string, number>> {
  const rows = await fetchAllPages<{ client_id: string; purchases: number }>(async (from, to) => {
    const { data, error } = await sb.rpc("client_purchase_counts").range(from, to);
    if (error) throw new SupabaseRepositoryError("customer.purchaseCounts", error);
    return data ?? [];
  });
  return new Map(rows.map((r) => [r.client_id, Number(r.purchases)]));
}
