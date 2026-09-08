import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Auditoría que NO se traga los errores.
 *
 * `auditRepository.log` avisa por consola y sigue, y para casi todo eso está
 * bien: que falle un registro no debe romperle el turno a nadie. Para el ojo de
 * las claves es al revés. La regla que el dueño acepta al guardar claves
 * legibles es «cada consulta queda registrada»; si el registro puede fallar en
 * silencio, esa regla es un cartel, no un control. Aquí: si no hay rastro, no
 * hay clave.
 *
 * `contarAcciones` cuenta sobre esa misma tabla para el límite de consultas:
 * un contador en memoria se reinicia con cada despliegue y no ve las otras
 * instancias, así que no limita nada de verdad.
 */

export interface EntradaAuditoria {
  businessId: string;
  actorId: string;
  actorNombre: string;
  action: string;
  entityId: string;
  /** 🔴 NUNCA una clave, ni un sobre de la bóveda, ni nada que abra una cuenta. */
  metadata?: Record<string, unknown>;
}

export class AuditoriaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditoriaError";
  }
}

/** Escribe el registro o LANZA. Quien la llama decide qué no hacer sin rastro. */
export async function auditarOFallar(entrada: EntradaAuditoria): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) {
    throw new AuditoriaError(
      "No se puede dejar constancia de esta acción (Supabase sin service_role).",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("audit_logs").insert({
    business_id: entrada.businessId,
    user_id: entrada.actorId || null,
    user_name: entrada.actorNombre || null,
    action: entrada.action,
    entity: "user",
    entity_id: entrada.entityId,
    metadata: entrada.metadata ?? null,
  });
  if (error) {
    throw new AuditoriaError(`No se pudo registrar la acción: ${error.message}`);
  }
}

/** Cuántas veces hizo el actor esta acción en la ventana dada (milisegundos). */
export async function contarAcciones(
  businessId: string,
  actorId: string,
  action: string,
  ventanaMs: number,
): Promise<number> {
  const admin = createServiceRoleClient();
  if (!admin) return 0;
  const desde = new Date(Date.now() - ventanaMs).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (admin as any)
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("user_id", actorId)
    .eq("action", action)
    .gte("created_at", desde);
  if (error) {
    // 🔴 Si no se puede contar, se cuenta como «muchas»: el límite existe para
    // que un descuido no vacíe la bóveda entera, y fallar hacia el lado
    // permisivo lo anularía justo cuando la base está rara.
    return Number.MAX_SAFE_INTEGER;
  }
  return count ?? 0;
}
