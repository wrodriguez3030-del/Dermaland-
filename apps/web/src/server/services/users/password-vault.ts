import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sellarClave, abrirClave, BovedaError } from "@/server/crypto/password-vault-cipher";

/**
 * La bóveda, del lado de la base: guardar y leer el sobre cifrado.
 *
 * La tabla `user_password_vault` tiene RLS activa y CERO políticas, más un
 * `revoke` a `anon` y `authenticated`: nadie la lee por PostgREST, ni con la
 * sesión de un administrador. Solo service_role desde el servidor, y solo
 * desde rutas que ya comprobaron rol, jerarquía y segundo factor.
 *
 * Todas las consultas llevan `business_id` explícito además del `user_id`:
 * service_role se salta la RLS, así que aquí el aislamiento entre negocios lo
 * pone el código o no lo pone nadie.
 */

export class BovedaDbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BovedaDbError";
  }
}

/** La clave no está en la bóveda, o ya no abre la cuenta. */
export type MotivoSinClave = "no_gestionada" | "desincronizada";

export interface ClaveGuardada {
  clave: string;
  asignadaEl: string;
  asignadaPor: string | null;
}

function cliente() {
  const admin = createServiceRoleClient();
  if (!admin) throw new BovedaDbError("Supabase sin service_role: la bóveda no está disponible.");
  return admin;
}

/** Guarda (o reemplaza) la clave sellada de un usuario. */
export async function guardarClave(params: {
  userId: string;
  businessId: string;
  pw: string;
  setBy: string;
}): Promise<void> {
  const sealed = sellarClave(params.userId, params.pw);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (cliente() as any).from("user_password_vault").upsert(
    {
      user_id: params.userId,
      business_id: params.businessId,
      sealed,
      set_by: params.setBy || null,
      set_at: new Date().toISOString(),
      // Se reasigna: la clave que se acaba de fijar SÍ abre la cuenta.
      stale: false,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new BovedaDbError(`No se pudo guardar la clave: ${error.message}`);
}

/**
 * Lee y abre la clave. Devuelve el motivo cuando no se puede, en vez de un
 * `null` que la pantalla tendría que interpretar: «nunca se le asignó desde el
 * panel» y «se la cambiaron por fuera y esto ya no sirve» piden mensajes
 * distintos.
 */
export async function leerClave(params: {
  userId: string;
  businessId: string;
  leidaPor: string;
}): Promise<{ ok: true; datos: ClaveGuardada } | { ok: false; motivo: MotivoSinClave }> {
  const admin = cliente();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("user_password_vault")
    .select("sealed,set_at,set_by,stale,view_count")
    .eq("user_id", params.userId)
    .eq("business_id", params.businessId)
    .maybeSingle();
  if (error) throw new BovedaDbError(`No se pudo leer la clave: ${error.message}`);
  if (!data) return { ok: false, motivo: "no_gestionada" };
  if (data.stale === true) return { ok: false, motivo: "desincronizada" };

  let clave: string;
  try {
    clave = abrirClave(data.sealed, params.userId);
  } catch (e) {
    // Un sobre que no abre no es «no hay clave»: es un problema de verdad
    // (llave cambiada, fila movida) y hay que decirlo, no enseñar un hueco.
    throw new BovedaDbError(
      e instanceof BovedaError ? e.message : "No se pudo abrir la clave guardada.",
    );
  }

  // Contador de consultas. Best-effort: el rastro que importa ya quedó en
  // `audit_logs` ANTES de llegar aquí, esto es solo para la pantalla.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("user_password_vault")
    .update({
      view_count: (Number(data.view_count) || 0) + 1,
      last_viewed_at: new Date().toISOString(),
      last_viewed_by: params.leidaPor || null,
    })
    .eq("user_id", params.userId)
    .eq("business_id", params.businessId);

  return {
    ok: true,
    datos: {
      clave,
      asignadaEl: String(data.set_at ?? ""),
      asignadaPor: data.set_by ? String(data.set_by) : null,
    },
  };
}

/** Marca la bóveda de un usuario como desincronizada (la clave cambió por fuera). */
export async function marcarDesincronizada(userId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (cliente() as any)
    .from("user_password_vault")
    .update({ stale: true })
    .eq("user_id", userId);
}
