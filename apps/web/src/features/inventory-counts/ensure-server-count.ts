import type { CountSession } from "./scan-session-store";
import { buildCountCreatePayload, persistCountToSupabase } from "./persist";

/** Conteo tal como existe en el servidor: id y almacén que él mismo resolvió. */
export interface ServerCountRef {
  id: string;
  warehouseId: string | null;
}

/**
 * Garantiza que la sesión tenga una cabecera en Supabase para poder colgar de
 * ella los escaneos. Es best-effort a propósito: sin red o con el backend en
 * modo mock devuelve null y el conteo sigue funcionando en local.
 *
 * La cabecera nace `in_progress` y SIN ítems: los ítems se consolidan al
 * aprobar (`consolidateCountOnServer`), para que un conteo sea siempre una
 * sola fila y nunca queden cabeceras huérfanas.
 */
export async function ensureServerCount(
  session: CountSession,
): Promise<ServerCountRef | null> {
  if (session.serverId) {
    return { id: session.serverId, warehouseId: session.serverWarehouseId ?? null };
  }
  const payload = buildCountCreatePayload(session, () => 0, "in_progress");
  const res = await persistCountToSupabase({ ...payload, items: [] });
  if (!res.ok || !res.id) return null;
  return { id: res.id, warehouseId: res.warehouseId ?? null };
}
