import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { nuevoDispositivo, codificar, hashSecreto, nombreGalleta } from "@/lib/auth/trusted-device-cookie";

/**
 * Computadoras de confianza: alta, listado y revocación.
 *
 * En la base va SOLO el hash del secreto. Quien lea la tabla no puede fabricar
 * una galleta válida con lo que ve.
 *
 * La etiqueta que se guarda es el navegador y el sistema, recortados. NO se
 * guarda el `User-Agent` completo ni la IP: para que el usuario reconozca cuál
 * es cuál basta «Chrome · macOS», y lo demás es un rastro de sus movimientos
 * que este sistema no necesita.
 */

export interface GalletaNueva {
  nombre: string;
  valor: string;
  maxAge: number;
}

/** «Chrome · macOS» a partir del User-Agent. Sin versiones ni huella. */
export function etiquetaDeNavegador(ua: string | null | undefined): string {
  const s = ua ?? "";
  const navegador = /Edg\//.test(s)
    ? "Edge"
    : /OPR\//.test(s)
      ? "Opera"
      : /Chrome\//.test(s)
        ? "Chrome"
        : /Safari\//.test(s)
          ? "Safari"
          : /Firefox\//.test(s)
            ? "Firefox"
            : "Navegador";
  const sistema = /Windows/.test(s)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(s)
      ? "macOS"
      : /Android/.test(s)
        ? "Android"
        : /iPhone|iPad/.test(s)
          ? "iOS"
          : /Linux/.test(s)
            ? "Linux"
            : "";
  return sistema ? `${navegador} · ${sistema}` : navegador;
}

export async function crearDispositivo(params: {
  userId: string;
  businessId: string;
  factorId: string;
  dias: number;
  ua?: string | null;
}): Promise<GalletaNueva | null> {
  if (params.dias <= 0) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const d = nuevoDispositivo();
  const hash = await hashSecreto(d.secreto);
  const expira = new Date(Date.now() + params.dias * 86_400_000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("trusted_devices").insert({
    id: d.deviceId,
    user_id: params.userId,
    business_id: params.businessId,
    token_hash: hash,
    user_agent: etiquetaDeNavegador(params.ua),
    factor_id: params.factorId,
    expires_at: expira,
  });
  if (error) return null;

  return {
    nombre: nombreGalleta(params.userId),
    valor: codificar(d),
    maxAge: params.dias * 86_400,
  };
}

export interface DispositivoListado {
  id: string;
  etiqueta: string;
  creadoEl: string;
  ultimoUso: string;
  expiraEl: string;
}

export async function listarDe(userId: string): Promise<DispositivoListado[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("trusted_devices")
    .select("id,user_agent,created_at,last_used_at,expires_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_used_at", { ascending: false })
    .range(0, 199);
  if (error) return [];
  return ((data as Array<Record<string, unknown>>) ?? []).map((f) => ({
    id: String(f.id),
    etiqueta: String(f.user_agent ?? "Navegador"),
    creadoEl: String(f.created_at ?? ""),
    ultimoUso: String(f.last_used_at ?? ""),
    expiraEl: String(f.expires_at ?? ""),
  }));
}

/**
 * Revoca uno o todos los dispositivos de un usuario.
 *
 * 🔴 SIEMPRE acotado por `user_id`. Con service_role la RLS no protege: si
 * faltara ese filtro, un id equivocado revocaría el dispositivo de otra
 * persona (o, sin id, los de todo el mundo).
 */
export async function revocar(params: {
  userId: string;
  deviceId?: string;
  por: string;
  motivo: string;
}): Promise<number> {
  const admin = createServiceRoleClient();
  if (!admin) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from("trusted_devices")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: params.por || null,
      revoke_reason: params.motivo,
    })
    .eq("user_id", params.userId)
    .is("revoked_at", null);
  if (params.deviceId) q = q.eq("id", params.deviceId);
  const { data, error } = await q.select("id");
  if (error) return 0;
  return ((data as unknown[]) ?? []).length;
}
