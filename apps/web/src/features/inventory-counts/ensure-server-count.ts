import type { CountSession } from "./scan-session-store";
import { buildCountCreatePayload, persistCountToSupabase } from "./persist";

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
): Promise<string | null> {
  if (session.serverId) return session.serverId;
  const payload = buildCountCreatePayload(session, () => 0, "in_progress");
  const res = await persistCountToSupabase({ ...payload, items: [] });
  return res.ok && res.id ? res.id : null;
}
