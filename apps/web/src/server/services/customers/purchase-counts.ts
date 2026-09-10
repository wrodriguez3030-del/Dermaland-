import "server-only";
import { SupabaseRepositoryError, type AnySupabase } from "@/server/repositories/supabase/client";

/**
 * Compras REALES por cliente (POS + Alegra), vía el RPC `client_purchase_counts`
 * (mig `20260910130000`). `clients.total_orders` NO sirve para esto: solo
 * cuenta ventas del POS propio y queda en 0 para casi todos los clientes
 * migrados de Alegra — el mismo silencio que `resumen_ventas_unificadas` ya
 * cerró para el panel y los reportes.
 *
 * `sb` tipado `AnySupabase` a propósito: `client_purchase_counts` es una
 * función nueva que `database.types.ts` (generado) todavía no conoce —
 * mismo patrón que `mergeClients`/`dryRunMergeImpact` en este mismo módulo.
 */
export async function getClientPurchaseCounts(sb: AnySupabase): Promise<Map<string, number>> {
  const { data, error } = await sb.rpc("client_purchase_counts");
  if (error) throw new SupabaseRepositoryError("customer.purchaseCounts", error);
  const rows = (data ?? []) as Array<{ client_id: string; purchases: number }>;
  return new Map(rows.map((r) => [r.client_id, Number(r.purchases)]));
}
